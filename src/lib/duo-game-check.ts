import { TERMS_VERSION } from "./account-policy";
import { rateLimit } from "./auth";
import { getSql, q, queryRows } from "./db";
import { duoEnabled, duoEligibilityCte, duoIdentityCte } from "./duo";
import { lookupPlayer } from "./riot";
import { confirmedBeforeCancellation, sharedStarts } from "./verified-duo-game";

// At both reservation and completion, require a currently accepted, unreported relationship.
// The stale-identity scope only authorizes refreshing public stats for these two verified accounts.
const participants = (includeCancelled = false) => `
  FROM wp_duo_requests r JOIN wp_lfg l ON l.id=r.listing_id
  JOIN eligible sender ON sender.id=r.sender_id AND sender.puuid=r.sender_puuid
  JOIN eligible owner ON owner.id=l.user_id AND owner.puuid=l.puuid
  LEFT JOIN wp_duo_game_checks ck ON ck.request_id=r.id AND ck.expires_at>now()
  WHERE $1 IN (sender.id,owner.id) AND sender.id<>owner.id AND l.safe_listing
    AND ((r.status='accepted' AND r.cancelled_at IS NULL)
      ${includeCancelled ? `OR (r.status='declined' AND r.cancelled_at IS NOT NULL AND ${confirmedBeforeCancellation})` : ""})
    AND l.status IN ('open','closed')
    AND r.accepted_at>now()-interval '30 days' AND r.accepted_at<=now()
    AND sender.age_band=owner.age_band AND sender.platform=owner.platform
    AND NOT EXISTS (SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN
      ((sender.id,owner.id),(owner.id,sender.id)))
    AND NOT EXISTS (SELECT 1 FROM wp_mutes m WHERE (m.muter_id,m.muted_id) IN
      ((sender.id,owner.id),(owner.id,sender.id)))
    AND NOT EXISTS (SELECT 1 FROM wp_reports f WHERE f.status='open'
      AND ((f.target_kind='duo_request' AND f.target_id=r.id) OR (f.target_kind='lfg' AND f.target_id=l.id)))`;

export interface PrivateGameCheck {
  requestId: number;
  acceptedAt: string;
  checkedAt: string | null;
  firstGameAt: string | null;
  repeatGameAt: string | null;
  cancelled?: true;
}

function isoDate(value: unknown) {
  return value == null ? null : new Date(String(value)).toISOString();
}

export async function privateGameChecks(userId: number): Promise<PrivateGameCheck[]> {
  if (!duoEnabled()) return [];
  const rows = await queryRows(`${duoIdentityCte} SELECT r.id,r.accepted_at,r.cancelled_at,ck.checked_at,ck.first_game_at,
    CASE WHEN r.cancelled_at IS NULL OR ck.repeat_game_at<=r.cancelled_at THEN ck.repeat_game_at END AS repeat_game_at
    ${participants(true)} ORDER BY r.accepted_at DESC,r.id DESC LIMIT 30`, [userId, TERMS_VERSION]);
  return rows.map(row => ({
    requestId: Number(row.id),
    acceptedAt: new Date(String(row.accepted_at)).toISOString(),
    checkedAt: isoDate(row.checked_at),
    firstGameAt: isoDate(row.first_game_at),
    repeatGameAt: isoDate(row.repeat_game_at),
    ...(row.cancelled_at ? { cancelled: true as const } : {}),
  }));
}

type CheckResult = { ok: true } | { ok: false; status: number; error: string };
const unavailable: CheckResult = { ok: false, status: 404, error: "This accepted duo is unavailable." };

export async function checkDuoGame(userId: number, id: number): Promise<CheckResult> {
  if (!duoEnabled()) return unavailable;
  const args = [userId, TERMS_VERSION, id];
  const [pair] = await queryRows(`${duoIdentityCte} SELECT sender.game_name AS s_name,sender.tag_line AS s_tag,
    owner.game_name AS o_name,owner.tag_line AS o_tag,sender.platform,sender.puuid AS s_id,owner.puuid AS o_id,
    least(sender.id,owner.id) AS first_user,greatest(sender.id,owner.id) AS second_user
    ${participants()} AND r.id=$3`, args);
  if (!pair) return unavailable;
  if (!await rateLimit(userId, "duo-game-check", 8, 60))
    return { ok: false, status: 429, error: "You can check up to eight duos per hour." };

  // Serialize the pair across tabs, instances, and repeated invitations in either direction.
  const sql = await getSql();
  const [, reserved] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(${Number(pair.first_user)}::int,${Number(pair.second_user)}::int)`,
    sql(`${duoIdentityCte} INSERT INTO wp_duo_game_checks(request_id,attempted_at,expires_at)
    SELECT r.id,now(),r.accepted_at+interval '30 days' ${participants()} AND r.id=$3
      AND NOT EXISTS (SELECT 1 FROM wp_duo_game_checks recent
        JOIN wp_duo_requests prior ON prior.id=recent.request_id JOIN wp_lfg old ON old.id=prior.listing_id
        WHERE recent.attempted_at>now()-interval '10 minutes'
          AND (prior.sender_id,old.user_id) IN ((sender.id,owner.id),(owner.id,sender.id)))
    ON CONFLICT(request_id) DO UPDATE SET attempted_at=excluded.attempted_at
      WHERE wp_duo_game_checks.attempted_at<=now()-interval '10 minutes'
    RETURNING request_id`, args),
  ]);
  if (!reserved.length)
    return { ok: false, status: 429, error: "A check was requested recently. Try again in ten minutes." };

  const [sender, owner] = await Promise.all([
    lookupPlayer(String(pair.platform), String(pair.s_name), String(pair.s_tag)),
    lookupPlayer(String(pair.platform), String(pair.o_name), String(pair.o_tag)),
  ]);
  if (!sender.ok || !owner.ok || sender.source === "stale" || owner.source === "stale" ||
      sender.player.puuid !== pair.s_id || owner.player.puuid !== pair.o_id) {
    return { ok: false, status: 503, error: "Riot could not confirm both recent profiles. Try again after ten minutes." };
  }

  // Preserve observed positives as snapshots roll forward. Negative coverage advances only
  // over contiguous completed games where both Riot histories were fully visible.

  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(${Number(pair.first_user)}::int,${Number(pair.second_user)}::int)`,
    sql(`${duoEligibilityCte}, observed AS (
    SELECT r.id,r.accepted_at,ck.covered_until,least(sender.fetched_at,owner.fetched_at) AS as_of,
      sender.snapshot->>'coverageFrom' AS s_from,owner.snapshot->>'coverageFrom' AS o_from,
      sender.snapshot->>'coverageThrough' AS s_to,owner.snapshot->>'coverageThrough' AS o_to,
      ARRAY(SELECT started FROM (${sharedStarts}) games UNION SELECT ck.first_game_at UNION SELECT ck.repeat_game_at) AS starts
    ${participants()} AND r.id=$3
  ), earliest AS (SELECT observed.*, (SELECT min(t) FROM unnest(starts) t) AS first_at FROM observed)
  UPDATE wp_duo_game_checks ck SET checked_at=now(),first_game_at=e.first_at,
    repeat_game_at=(SELECT min(t) FROM unnest(e.starts) t WHERE (t AT TIME ZONE 'UTC')::date>(e.first_at AT TIME ZONE 'UTC')::date
      AND t<=e.first_at+interval '168 hours'),
    covered_until=CASE WHEN e.s_from ~ '^[0-9]{1,13}$' AND e.o_from ~ '^[0-9]{1,13}$'
      AND e.s_to ~ '^[0-9]{1,13}$' AND e.o_to ~ '^[0-9]{1,13}$'
      THEN CASE WHEN greatest(e.s_from::bigint,e.o_from::bigint)<=extract(epoch FROM coalesce(e.covered_until,e.accepted_at))*1000
        AND e.as_of>=e.accepted_at THEN greatest(e.covered_until, least(e.as_of,to_timestamp(least(e.s_to::bigint,e.o_to::bigint)/1000.0)))
        ELSE e.covered_until END ELSE e.covered_until END
  FROM earliest e WHERE e.id=ck.request_id RETURNING ck.request_id`, args),
  ]);
  return rows.length ? { ok: true } : unavailable;
}

export async function clearExpiredGameChecks() {
  await q`DELETE FROM wp_duo_game_checks WHERE expires_at<=now()`;
}
