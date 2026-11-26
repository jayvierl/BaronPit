/** Run after the base post and comment tables in the schema transaction. */
export const decisionSchema = [
  `CREATE TABLE IF NOT EXISTS wp_decisions (
    post_id integer PRIMARY KEY REFERENCES wp_posts(id) ON DELETE CASCADE,
    champion text NOT NULL, opponent text, role text NOT NULL, topic text NOT NULL, patch text,
    accepted_comment_id integer REFERENCES wp_comments(id) ON DELETE SET NULL,
    accepted_at timestamptz, outcome text CHECK (outcome IN ('helped','mixed','still-testing')),
    tried_at timestamptz, trial_match jsonb
  )`,
  `ALTER TABLE wp_decisions ADD COLUMN IF NOT EXISTS item_id integer, ADD COLUMN IF NOT EXISTS item_name text`,
  `CREATE TABLE IF NOT EXISTS wp_decision_preferences (
    user_id integer PRIMARY KEY REFERENCES wp_users(id) ON DELETE CASCADE, role text NOT NULL, champion text
  )`,
  `CREATE INDEX IF NOT EXISTS wp_decisions_matchup ON wp_decisions(champion,opponent,post_id DESC)`,
];
