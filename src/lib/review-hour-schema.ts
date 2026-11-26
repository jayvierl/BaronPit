/** Only two rotating slots. A new week's confirmation replaces the previous one. */
export const reviewHourSchema = [
  `CREATE TABLE IF NOT EXISTS wp_review_hour_hosts (
    role text PRIMARY KEY CHECK(role IN ('Bot','Support')),
    starts_at timestamptz NOT NULL, user_id integer NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    UNIQUE(starts_at,user_id))`,
  `CREATE TABLE IF NOT EXISTS wp_pilot_feature_samples (
    user_id integer PRIMARY KEY REFERENCES wp_pilot_members(user_id) ON DELETE CASCADE,
    opened_at timestamptz NOT NULL DEFAULT now(), another_thread boolean NOT NULL DEFAULT false,
    new_question boolean NOT NULL DEFAULT false)`,
  `CREATE INDEX IF NOT EXISTS wp_decisions_accepted_week ON wp_decisions(accepted_at, post_id)
    WHERE opponent IS NOT NULL AND accepted_comment_id IS NOT NULL`,
];
