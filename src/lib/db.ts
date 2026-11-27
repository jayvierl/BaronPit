import { profilePhotoSchema } from "./profile-photo-schema";
import { submissionSchema } from "./submission-schema";
import { communityObjectiveSchema } from "./community-objective-schema";
import { DAILY_CALL_LAUNCH_KEY, dailyCallSchema } from "./daily-call-schema";
import { APP_NAME } from "./brand";
import { PATCH_PUBLISHER } from "./patch-notes";
import { spotlightSchema } from "./spotlight-schema";
import { decisionSchema } from "./decision-schema";
import { moderationDecisionsSchema } from "./moderation-decisions-schema";
import { quoteSchema } from "./quote-schema";
import { librarySchema } from "./discussion-library-schema";
import { reviewHourSchema } from "./review-hour-schema";
import { duoFitSchema } from "./duo-fit-schema";
import { pilotSchema } from "./pilot-schema";
import { duoExtraSchema } from "./duo-extra-schema";
import { ownershipSchema } from "./riot-ownership-schema";
import { authSchemaSql } from "./auth-schema";
import { caseSchema } from "./case-schema";
import { duoSchema } from "./duo-schema";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Data layer for Neon Postgres with lazy schema initialization.
 * Each player has one replaceable cache of up to 100 recent matches. Durable
 * rank history holds only daily queue observations from successful refreshes.
 */

type Sql = NeonQueryFunction<false, false>;
// Keep the deployed pre-generation bundle from replaying old DDL during a rolling release.
const LEGACY_SCHEMA_REVISION = "baron-profile-avatar-20261126-1";
const SCHEMA_GENERATION = 5;
let client: Sql | undefined;
let ready: Promise<void> | undefined;

// The production database must never be migrated from a review deployment.
function databaseUrl() {
  return process.env.VERCEL_ENV === "preview" ? process.env.WARD_PREVIEW_DATABASE_URL : process.env.DATABASE_URL;
}
export function dbAvailable(): boolean {
  return Boolean(databaseUrl());
}

export async function getSql(): Promise<Sql> {
  const url = databaseUrl();
  if (!url) throw new Error("Community storage is unavailable");
  client ??= neon(url);
  ready ??= initialize(client).catch(error => { ready = undefined; throw error; });
  await ready;
  return client;
}

function readSchemaGeneration(sql: Sql) {
  return sql`SELECT g.value::bigint AS generation, EXISTS (
    SELECT 1 FROM wp_meta WHERE key=${DAILY_CALL_LAUNCH_KEY}
  ) AS daily_call_launched FROM wp_meta g WHERE g.key='schema_generation'`;
}

async function maybeSeedDailyCall(sql: Sql, generation: number, launched = false) {
  if (generation !== SCHEMA_GENERATION || launched || process.env.VERCEL_ENV !== "production") return;
  try {
    const { seedFirstDailyCall } = await import("./daily-call");
    await seedFirstDailyCall(sql, generation);
  } catch {
    console.warn("Daily Call launch publication did not finish. The scheduled job will retry.");
  }
}

async function initialize(sql: Sql) {
  try {
    const [schema] = await readSchemaGeneration(sql);
    const generation = Number(schema?.generation);
    if (generation >= SCHEMA_GENERATION) {
      await maybeSeedDailyCall(sql, generation, schema.daily_call_launched === true);
      return;
    }
  } catch (error) {
    // An empty database has no metadata table. Other errors require a retry.
    if ((error as {code?: string}).code !== "42P01") throw error;
  }
  try {
    await sql.transaction(schemaStatements(sql, true));
  } catch (error) {
    // Another cold start finished while this request waited for the migration lock.
    if ((error as {code?: string}).code !== "BP001") throw error;
    if (process.env.VERCEL_ENV === "production") {
      const [schema] = await readSchemaGeneration(sql);
      await maybeSeedDailyCall(sql, Number(schema?.generation), schema?.daily_call_launched === true);
    }
    return;
  }
  await maybeSeedDailyCall(sql, SCHEMA_GENERATION);
}

export async function q(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Record<string, unknown>[]> {
  const sql = await getSql();
  return (await sql(strings, ...values)) as Record<string, unknown>[];
}

/** Use for prepared SQL assembled exclusively from source-controlled query fragments. */
export async function queryRows(statement: string, values: unknown[]): Promise<Record<string, unknown>[]> {
  const sql = await getSql();
  return (await sql(statement, values)) as Record<string, unknown>[];
}

// One ordered transaction keeps foreign-key dependencies and concurrent cold starts safe.
export function schemaStatements(sql: Sql, checkAfterLock = false) {
  return [
    sql`SELECT pg_advisory_xact_lock(hashtext('wp_schema_init'))`,
    sql`CREATE TABLE IF NOT EXISTS wp_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )`,
    // Neon's HTTP transaction is submitted as a batch. End it before any DDL if
    // another worker is already at this generation or a newer one.
    ...(checkAfterLock ? [sql(`DO $guard$ BEGIN
      IF EXISTS (SELECT 1 FROM wp_meta WHERE key='schema_generation' AND value::bigint >= ${SCHEMA_GENERATION}) THEN
        RAISE EXCEPTION 'Schema already applied' USING ERRCODE='BP001';
      END IF;
    END $guard$`, [])] : []),
    sql`CREATE TABLE IF NOT EXISTS wp_users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_hue INT NOT NULL DEFAULT 140,
    bio TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    banned_until TIMESTAMPTZ,
    strike_count INT NOT NULL DEFAULT 0
  )`,
    sql`ALTER TABLE wp_users ADD COLUMN IF NOT EXISTS avatar_ref jsonb,
      ADD COLUMN IF NOT EXISTS profile_version integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS profile_link text`,
    sql`CREATE INDEX IF NOT EXISTS wp_users_display_prefix_idx ON wp_users (lower(display_name) text_pattern_ops)`,
    sql`CREATE TABLE IF NOT EXISTS wp_magic_links (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // Replaceable recent-form cache.
    sql`CREATE TABLE IF NOT EXISTS wp_players (
    puuid TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    game_name TEXT NOT NULL,
    tag_line TEXT NOT NULL,
    summoner_level INT NOT NULL DEFAULT 0,
    profile_icon INT NOT NULL DEFAULT 0,
    rank_tier TEXT, rank_div TEXT, rank_lp INT,
    rank_wins INT, rank_losses INT,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
    sql`CREATE INDEX IF NOT EXISTS wp_players_name_idx ON wp_players (lower(game_name), lower(tag_line), platform)`,
    sql`CREATE INDEX IF NOT EXISTS wp_players_name_prefix_idx ON wp_players (lower(game_name) text_pattern_ops)`,
    sql`CREATE INDEX IF NOT EXISTS wp_players_fetched_at_idx ON wp_players (fetched_at)`,
    sql`CREATE TABLE IF NOT EXISTS wp_rank_history (
      puuid TEXT NOT NULL REFERENCES wp_players(puuid) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      queue TEXT NOT NULL CHECK (queue IN ('RANKED_SOLO_5x5', 'RANKED_FLEX_SR')),
      observed_day DATE NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER')),
      division TEXT NOT NULL CHECK (division IN ('I', 'II', 'III', 'IV')),
      lp BIGINT NOT NULL,
      wins BIGINT NOT NULL CHECK (wins >= 0),
      losses BIGINT NOT NULL CHECK (losses >= 0),
      captured_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (puuid, queue, observed_day),
      CHECK (observed_day = (captured_at AT TIME ZONE 'UTC')::date)
    )`,
  // Account <-> Riot player links. verified stays false until RSO ships.
    sql`CREATE TABLE IF NOT EXISTS wp_links (
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    puuid TEXT NOT NULL REFERENCES wp_players(puuid) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, puuid)
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_follows (
    follower_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    followee_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id)
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_posts (
    id SERIAL PRIMARY KEY,
    author_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'text',
    body TEXT NOT NULL DEFAULT '',
    room_id INT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'visible',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
    sql`CREATE INDEX IF NOT EXISTS wp_posts_feed_idx ON wp_posts (status, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS wp_posts_room_idx ON wp_posts (room_id, status, created_at DESC)`,
    sql`CREATE TABLE IF NOT EXISTS wp_comments (
    id SERIAL PRIMARY KEY,
    post_id INT NOT NULL REFERENCES wp_posts(id) ON DELETE CASCADE,
    author_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    parent_id INT REFERENCES wp_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
    sql`CREATE INDEX IF NOT EXISTS wp_comments_post_idx ON wp_comments (post_id, created_at)`,
    sql`CREATE TABLE IF NOT EXISTS wp_reactions (
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    target_kind TEXT NOT NULL,
    target_id INT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, target_kind, target_id, emoji)
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_poll_votes (
    post_id INT NOT NULL REFERENCES wp_posts(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    option_idx INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_rooms (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'general',
    champion_id TEXT,
    description TEXT NOT NULL DEFAULT '',
    created_by INT REFERENCES wp_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_room_members (
    room_id INT NOT NULL REFERENCES wp_rooms(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_reports (
    id SERIAL PRIMARY KEY,
    reporter_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    target_kind TEXT NOT NULL,
    target_id INT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_blocks (
    blocker_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    blocked_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id)
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_mutes (
    muter_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    muted_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (muter_id, muted_id)
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_mod_log (
    id SERIAL PRIMARY KEY,
    target_kind TEXT NOT NULL,
    target_id INT,
    author_id INT,
    score INT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_endorsements (
    id SERIAL PRIMARY KEY,
    from_user INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    to_user INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_user, to_user, kind)
  )`,
    sql`CREATE TABLE IF NOT EXISTS wp_lfg (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    puuid TEXT NOT NULL,
    roles TEXT[] NOT NULL DEFAULT '{}',
    champs TEXT[] NOT NULL DEFAULT '{}',
    play_times TEXT NOT NULL DEFAULT '',
    voice BOOLEAN NOT NULL DEFAULT false,
    vibe TEXT NOT NULL DEFAULT 'both',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '4 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
    sql`CREATE INDEX IF NOT EXISTS wp_reactions_target_idx ON wp_reactions (target_kind, target_id)`,
    sql`CREATE INDEX IF NOT EXISTS wp_links_puuid_idx ON wp_links (puuid)`,
    sql`CREATE INDEX IF NOT EXISTS wp_reports_target_idx ON wp_reports (target_kind, target_id, status)`,
    sql`CREATE INDEX IF NOT EXISTS wp_mod_log_author_idx ON wp_mod_log (author_id)`,
    sql`ALTER TABLE wp_lfg ADD COLUMN IF NOT EXISTS blocks TEXT[] NOT NULL DEFAULT '{}'`,
    sql`ALTER TABLE wp_comments ADD COLUMN IF NOT EXISTS one_fix BOOLEAN NOT NULL DEFAULT false`,
    sql`CREATE TABLE IF NOT EXISTS wp_rate_events (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
    sql`CREATE INDEX IF NOT EXISTS wp_rate_idx ON wp_rate_events (user_id, action, created_at)`,
    sql`CREATE INDEX IF NOT EXISTS wp_recent_visible_comments ON wp_comments(created_at DESC,post_id) WHERE status='visible'`,
    sql`CREATE INDEX IF NOT EXISTS wp_posts_author_feed_idx ON wp_posts(author_id,created_at DESC,id DESC) WHERE status='visible'`,
    sql`ALTER TABLE wp_posts ADD COLUMN IF NOT EXISTS card_validated boolean NOT NULL DEFAULT false`,
    ...authSchemaSql.map(text => sql(text, [])),
    ...caseSchema(sql),
    ...submissionSchema(sql),
    sql`UPDATE wp_users SET display_name=${APP_NAME},avatar_hue=265
      WHERE email=${PATCH_PUBLISHER} AND safety_status='visible'
        AND (display_name,avatar_hue) IS DISTINCT FROM (${APP_NAME},265)`,
    ...duoSchema(sql),
    sql`CREATE TABLE IF NOT EXISTS wp_duo_shortlist (
      owner_id integer NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
      player_id integer NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
      pinned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_id, player_id), CHECK (owner_id <> player_id)
    )`,
    sql`CREATE INDEX IF NOT EXISTS wp_duo_shortlist_player_idx ON wp_duo_shortlist(player_id)`,
    sql`ALTER TABLE wp_posts ADD COLUMN IF NOT EXISTS replies_closed boolean NOT NULL DEFAULT false`,
    ...[...ownershipSchema, ...decisionSchema, ...moderationDecisionsSchema, ...librarySchema, ...pilotSchema, ...duoExtraSchema, ...duoFitSchema, ...reviewHourSchema, ...communityObjectiveSchema, ...spotlightSchema, ...dailyCallSchema, ...quoteSchema].map(text => sql(text, [])),
    sql`CREATE TABLE IF NOT EXISTS wp_safety_page_delivery (receipt uuid PRIMARY KEY, opened_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(), lease_id uuid, delivered_at timestamptz)`,
    ...profilePhotoSchema(sql),
    sql`INSERT INTO wp_meta(key,value) VALUES ('schema_revision',${LEGACY_SCHEMA_REVISION})
      ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE wp_meta.value IS DISTINCT FROM excluded.value`,
    sql`INSERT INTO wp_meta(key,value) VALUES ('schema_generation',${String(SCHEMA_GENERATION)})
      ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE wp_meta.value::bigint < excluded.value::bigint`,
  ];
}
