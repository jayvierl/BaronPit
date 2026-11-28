// Additive for accounts and outstanding links issued by previous deployments.
export const authSchemaSql = [
  "ALTER TABLE wp_users ADD COLUMN IF NOT EXISTS age_band text, ADD COLUMN IF NOT EXISTS terms_version text, ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz",
  "ALTER TABLE wp_magic_links ADD COLUMN IF NOT EXISTS may_create boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS return_to text NOT NULL DEFAULT '/me'",
  // Sign-in codes ride the same magic-link row: only the code's hash is stored,
  // with a failed-attempt counter that kills the row at the cap.
  "ALTER TABLE wp_magic_links ADD COLUMN IF NOT EXISTS code_hash text, ADD COLUMN IF NOT EXISTS code_attempts integer NOT NULL DEFAULT 0",
  // Pending icon-ownership challenges for claimed Riot links (Feature: icon verification).
  `CREATE TABLE IF NOT EXISTS wp_link_verifications (
     user_id integer NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
     puuid text NOT NULL, icon_id integer NOT NULL,
     expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, puuid),
     FOREIGN KEY (user_id, puuid) REFERENCES wp_links (user_id, puuid) ON DELETE CASCADE)`,
  "CREATE TABLE IF NOT EXISTS wp_action_windows (bucket text PRIMARY KEY, hits timestamptz[] NOT NULL, expires_at timestamptz NOT NULL)",
  "CREATE INDEX IF NOT EXISTS wp_action_windows_expiry ON wp_action_windows(expires_at)",
  // Keep quotas already spent on the preceding release until their original windows expire.
  `INSERT INTO wp_action_windows(bucket,hits,expires_at)
    SELECT 'user:'||user_id||':'||action, array_agg(created_at ORDER BY created_at), max(created_at)+interval '1 day'
    FROM wp_rate_events WHERE created_at>now()-interval '1 day' GROUP BY user_id,action ON CONFLICT DO NOTHING`,
];
