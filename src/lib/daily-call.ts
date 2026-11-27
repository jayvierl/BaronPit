import { APP_NAME } from "./brand";
import { HIDDEN_AUTHORS, canDisplayPost } from "./community-queries";
import { dailyCallScenarios } from "./daily-call-scenarios";
import { DAILY_CALL_LAUNCH_KEY } from "./daily-call-schema";
import { getSql, queryRows } from "./db";
import { PATCH_PUBLISHER } from "./patch-notes";

const DAY_MS = 24 * 60 * 60 * 1000;
// Hobby cron can arrive anywhere in its scheduled UTC hour.
const RESET_MS = 13 * 60 * 60_000;

export function dailyCallWindow(asOf: Date) {
  const index = Math.floor((asOf.getTime() - RESET_MS) / DAY_MS);
  const start = index * DAY_MS + RESET_MS;
  const opensAt = new Date(start).toISOString();
  const closesAt = new Date(start + DAY_MS).toISOString();
  const length = dailyCallScenarios.length;
  const scenario = dailyCallScenarios[((index % length) + length) % length];
  return { day: opensAt.slice(0, 10), opensAt, closesAt, scenario };
}

type DailyCallSql = Awaited<ReturnType<typeof getSql>>;
const pausedPublication = () => process.env.SAFETY_PAUSE_PUBLICATION === "true";
const firstLaunchPending = `NOT EXISTS (SELECT 1 FROM wp_daily_calls)
  AND NOT EXISTS (SELECT 1 FROM wp_meta WHERE key LIKE 'daily_call:%' OR key='${DAILY_CALL_LAUNCH_KEY}')`;

function preparePublisher(sql: DailyCallSql, paused: boolean, firstOnly = false) {
  return [
    sql`SELECT pg_advisory_xact_lock(hashtext('wp_daily_call'))`,
    sql(`INSERT INTO wp_users(email,display_name,avatar_hue) SELECT $1,$2,265
      WHERE NOT $3::boolean AND (NOT $4::boolean OR (${firstLaunchPending})) ON CONFLICT(email) DO NOTHING`,
    [PATCH_PUBLISHER, APP_NAME, paused, firstOnly]),
    sql(`INSERT INTO wp_rooms(slug,name,description) SELECT 'general',$1,'Meet the community, swap stories and find someone for your next game.'
      WHERE NOT $2::boolean AND (NOT $3::boolean OR (${firstLaunchPending})) ON CONFLICT(slug) DO NOTHING`,
    [`The ${APP_NAME}`, paused, firstOnly]),
  ] as const;
}

function openDailyCall(sql: DailyCallSql, window: ReturnType<typeof dailyCallWindow>, paused: boolean, firstOnly = false) {
  const { day, opensAt, closesAt, scenario } = window;
  return sql(`WITH source AS MATERIALIZED (
    SELECT a.id AS author_id,r.id AS room_id FROM wp_users a CROSS JOIN wp_rooms r
    WHERE a.email=$1 AND a.safety_status='visible' AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())
      AND r.slug='general' AND r.safety_status='visible' AND NOT $2::boolean
      AND (NOT $3::boolean OR (${firstLaunchPending}))
  ), claimed AS (
    INSERT INTO wp_meta(key,value) SELECT $4,'published' FROM source
      WHERE NOT EXISTS (SELECT 1 FROM wp_daily_calls WHERE day>=$5::date)
    ON CONFLICT(key) DO NOTHING RETURNING key
  ), inserted AS (
    INSERT INTO wp_posts(author_id,kind,body,room_id,data,status)
    SELECT author_id,'poll',$6,room_id,$7::jsonb,'visible' FROM source CROSS JOIN claimed RETURNING id
  ) INSERT INTO wp_daily_calls(day,post_id,title,opens_at,closes_at)
    SELECT $5::date,id,$8,$9::timestamptz,$10::timestamptz FROM inserted RETURNING post_id`,
  [PATCH_PUBLISHER, paused, firstOnly, `daily_call:${day}`, day, `${scenario.title}\n${scenario.body}`,
    JSON.stringify({ options: scenario.options }), scenario.title, opensAt, closesAt]);
}

/** Production initialization supplies its connection and expected schema generation. */
export async function seedFirstDailyCall(sql: DailyCallSql, generation: number, asOf = new Date()) {
  if (process.env.VERCEL_ENV !== "production") return 0;
  const paused = pausedPublication();
  const [, , , , , opened] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('wp_schema_init'))`,
    sql(`DO $guard$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM wp_meta WHERE key='schema_generation' AND value::bigint = ${generation}) THEN
        RAISE EXCEPTION 'Schema generation changed' USING ERRCODE='BP001';
      END IF;
    END $guard$`, []),
    ...preparePublisher(sql, paused, true), openDailyCall(sql, dailyCallWindow(asOf), paused, true),
    sql`INSERT INTO wp_meta(key,value) VALUES (${DAILY_CALL_LAUNCH_KEY},'handled') ON CONFLICT(key) DO NOTHING`,
  ]);
  return opened.length;
}

/** Freeze expired ballots before writing the result and the next morning's poll. */
export async function runDailyCall(asOf = new Date()) {
  const window = dailyCallWindow(asOf);
  const cutoff = asOf.toISOString();
  const paused = pausedPublication();
  const sql = await getSql();
  const [, , , , closed, payoffs, opened] = await sql.transaction([
    ...preparePublisher(sql, paused),
    // The vote guard takes a share lock on this row. Lock first and count in a
    // separate statement so a vote committing before cutoff enters our snapshot.
    sql`SELECT day FROM wp_daily_calls WHERE closes_at <= ${cutoff}::timestamptz AND tally IS NULL ORDER BY day FOR UPDATE`,
    sql`UPDATE wp_daily_calls AS ballot SET tally=ARRAY(
      SELECT count(v.user_id)::integer FROM generate_series(0,3) AS option(option_idx)
      LEFT JOIN wp_poll_votes v ON v.post_id=ballot.post_id AND v.option_idx=option.option_idx
      GROUP BY option.option_idx ORDER BY option.option_idx
    ) WHERE closes_at <= ${cutoff}::timestamptz AND tally IS NULL RETURNING day`,
    sql`WITH due AS (
      SELECT d.day,d.title,d.tally,p.author_id,p.room_id,p.data->'options' AS options
      FROM wp_daily_calls d JOIN wp_posts p ON p.id=d.post_id
      JOIN wp_users a ON a.id=p.author_id JOIN wp_rooms r ON r.id=p.room_id
      WHERE d.tally IS NOT NULL AND d.payoff_published_at IS NULL AND p.status='visible' AND p.withdrawn_at IS NULL
        AND p.kind='poll' AND a.email=${PATCH_PUBLISHER} AND a.safety_status='visible'
        AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())
        AND r.slug='general' AND r.safety_status='visible' AND NOT ${paused}::boolean
    ), stats AS (
      SELECT d.*, totals.total, totals.highest, winners.labels, winners.number
      FROM due d CROSS JOIN LATERAL (SELECT sum(n) AS total,max(n) AS highest FROM unnest(d.tally) v(n)) totals
      CROSS JOIN LATERAL (
        SELECT string_agg(d.options->>(v.position::int-1),' / ' ORDER BY v.position) AS labels,count(*) AS number
        FROM unnest(d.tally) WITH ORDINALITY v(n,position) WHERE v.n=totals.highest
      ) winners
    ), inserted AS (
      INSERT INTO wp_posts(author_id,kind,body,room_id,data,status)
      SELECT author_id,'text','Daily Call results · '||title||chr(10)||CASE
        WHEN total=0 THEN 'No one voted in this round.'
        WHEN number>1 THEN labels||' tied at '||round(100.0*highest/total,1)||'% each ('||total||' votes in total).'
        ELSE labels||' led with '||round(100.0*highest/total,1)||'% ('||highest||' of '||total||CASE WHEN total=1 THEN ' vote).' ELSE ' votes).' END
        END||' These are community votes on a hypothetical scenario.',room_id,jsonb_build_object('dailyCallPayoff',day::text),'visible'
      FROM stats ORDER BY day RETURNING id,data
    ) UPDATE wp_daily_calls d SET payoff_post_id=i.id,payoff_published_at=clock_timestamp() FROM inserted i
      WHERE d.day=(i.data->>'dailyCallPayoff')::date RETURNING d.day`,
    openDailyCall(sql, window, paused),
  ]);
  return { day: window.day, opened: opened.length, closed: closed.length, payoffs: payoffs.length };
}

export async function dailyCallsForHome(viewerId: number | null) {
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}, candidates AS (
    SELECT d.day,d.title,p.id,'poll' AS kind FROM wp_daily_calls d JOIN wp_posts p ON p.id=d.post_id
    WHERE d.tally IS NULL AND d.opens_at<=now() AND d.closes_at>now() AND p.status='visible' AND ${canDisplayPost}
    UNION ALL
    SELECT d.day,d.title,p.id,'result' AS kind FROM wp_daily_calls d JOIN wp_posts p ON p.id=d.payoff_post_id
    WHERE d.closes_at>now()-interval '3 days' AND p.status='visible' AND ${canDisplayPost}
    UNION ALL
    SELECT NULL::date,NULL::text,NULL::int,'waiting' AS kind
    WHERE NOT $3::boolean AND NOT EXISTS (SELECT 1 FROM wp_daily_calls)
      AND NOT EXISTS (SELECT 1 FROM wp_rooms WHERE slug='general' AND safety_status<>'visible')
      AND NOT EXISTS (SELECT 1 FROM wp_users WHERE email=$2 AND id IN (SELECT id FROM hidden))
  ) SELECT DISTINCT ON (kind) id,title,kind FROM candidates ORDER BY kind,day DESC`,
  [viewerId, PATCH_PUBLISHER, process.env.SAFETY_PAUSE_PUBLICATION === "true"]);
  const entries = rows.flatMap(row => row.kind === "poll" || row.kind === "result"
    ? [{ id: Number(row.id), title: String(row.title), kind: row.kind }]
    : []);
  return { entries, awaitingFirst: rows.some(row => row.kind === "waiting") };
}
