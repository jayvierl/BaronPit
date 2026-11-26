import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Data layer — Neon Postgres, lazy schema.
 *
 * Design rule from the build brief: MINIMAL RETENTION. We cache a player's
 * recent form (last ~20 matches) briefly and keep social content. There is
 * deliberately NO match archive: wp_players holds only the latest snapshot
 * per player and it is overwritten on refresh.
 */

let sqlPromise: Promise<NeonQueryFunction<false, false>> | null = null;
let schemaPromise: Promise<void> | null = null;

export function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

async function getSql(): Promise<NeonQueryFunction<false, false>> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!sqlPromise) {
    sqlPromise = (async () => neon(process.env.DATABASE_URL!) as NeonQueryFunction<false, false>)();
  }
  const sql = await sqlPromise;
  if (!schemaPromise) {
    // Clear the cached promise on failure so one transient error doesn't poison the instance.
    schemaPromise = createSchema(sql).catch((e) => { schemaPromise = null; throw e; });
  }
  await schemaPromise;
  return sql;
}

export async function q(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Record<string, unknown>[]> {
  const sql = await getSql();
  return (await sql(strings, ...values)) as Record<string, unknown>[];
}

async function createSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS wp_users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_hue INT NOT NULL DEFAULT 140,
    bio TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    banned_until TIMESTAMPTZ,
    strike_count INT NOT NULL DEFAULT 0
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_magic_links (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // Recent-form cache ONLY (overwritten per refresh; no history kept).
  await sql`CREATE TABLE IF NOT EXISTS wp_players (
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
  )`;
  await sql`CREATE INDEX IF NOT EXISTS wp_players_name_idx ON wp_players (lower(game_name), lower(tag_line), platform)`;
  // Account <-> Riot player links. verified stays false until RSO ships.
  await sql`CREATE TABLE IF NOT EXISTS wp_links (
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    puuid TEXT NOT NULL REFERENCES wp_players(puuid) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, puuid)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_follows (
    follower_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    followee_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_posts (
    id SERIAL PRIMARY KEY,
    author_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'text',
    body TEXT NOT NULL DEFAULT '',
    room_id INT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'visible',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS wp_posts_feed_idx ON wp_posts (status, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS wp_posts_room_idx ON wp_posts (room_id, status, created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS wp_comments (
    id SERIAL PRIMARY KEY,
    post_id INT NOT NULL REFERENCES wp_posts(id) ON DELETE CASCADE,
    author_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    parent_id INT REFERENCES wp_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS wp_comments_post_idx ON wp_comments (post_id, created_at)`;
  await sql`CREATE TABLE IF NOT EXISTS wp_reactions (
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    target_kind TEXT NOT NULL,
    target_id INT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, target_kind, target_id, emoji)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_poll_votes (
    post_id INT NOT NULL REFERENCES wp_posts(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    option_idx INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_rooms (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'general',
    champion_id TEXT,
    description TEXT NOT NULL DEFAULT '',
    created_by INT REFERENCES wp_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_room_members (
    room_id INT NOT NULL REFERENCES wp_rooms(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_reports (
    id SERIAL PRIMARY KEY,
    reporter_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    target_kind TEXT NOT NULL,
    target_id INT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_blocks (
    blocker_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    blocked_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_mutes (
    muter_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    muted_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (muter_id, muted_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_mod_log (
    id SERIAL PRIMARY KEY,
    target_kind TEXT NOT NULL,
    target_id INT,
    author_id INT,
    score INT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_endorsements (
    id SERIAL PRIMARY KEY,
    from_user INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    to_user INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_user, to_user, kind)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_lfg (
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
  )`;
  await sql`CREATE TABLE IF NOT EXISTS wp_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  )`;
  await sql`CREATE INDEX IF NOT EXISTS wp_reactions_target_idx ON wp_reactions (target_kind, target_id)`;
  await sql`CREATE INDEX IF NOT EXISTS wp_links_puuid_idx ON wp_links (puuid)`;
  await sql`CREATE INDEX IF NOT EXISTS wp_reports_target_idx ON wp_reports (target_kind, target_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS wp_mod_log_author_idx ON wp_mod_log (author_id)`;
  await sql`ALTER TABLE wp_lfg ADD COLUMN IF NOT EXISTS blocks TEXT[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE wp_comments ADD COLUMN IF NOT EXISTS one_fix BOOLEAN NOT NULL DEFAULT false`;
  await sql`CREATE TABLE IF NOT EXISTS wp_rate_events (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS wp_rate_idx ON wp_rate_events (user_id, action, created_at)`;
}
