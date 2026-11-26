// Additive for accounts and outstanding links issued by previous deployments.
export const authSchemaSql = [
  "ALTER TABLE wp_users ADD COLUMN IF NOT EXISTS age_band text, ADD COLUMN IF NOT EXISTS terms_version text, ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz",
  "ALTER TABLE wp_magic_links ADD COLUMN IF NOT EXISTS may_create boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS return_to text NOT NULL DEFAULT '/me'",
  "CREATE TABLE IF NOT EXISTS wp_action_windows (bucket text PRIMARY KEY, hits timestamptz[] NOT NULL, expires_at timestamptz NOT NULL)",
  "CREATE INDEX IF NOT EXISTS wp_action_windows_expiry ON wp_action_windows(expires_at)",
  // Keep quotas already spent on the preceding release until their original windows expire.
  `INSERT INTO wp_action_windows(bucket,hits,expires_at)
    SELECT 'user:'||user_id||':'||action, array_agg(created_at ORDER BY created_at), max(created_at)+interval '1 day'
    FROM wp_rate_events WHERE created_at>now()-interval '1 day' GROUP BY user_id,action ON CONFLICT DO NOTHING`,
];
