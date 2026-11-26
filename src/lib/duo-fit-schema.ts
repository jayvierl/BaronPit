// One private preference row per account. No contact information or match data.
export const duoFitSchema = [
  `CREATE TABLE IF NOT EXISTS wp_duo_fit (
    user_id int PRIMARY KEY REFERENCES wp_users(id) ON DELETE CASCADE,
    role text NOT NULL, partner_role text NOT NULL, blocks text[] NOT NULL,
    vibe text NOT NULL, communication text NOT NULL)`,
  `ALTER TABLE wp_duo_fit ADD COLUMN IF NOT EXISTS time_zone text`,
  `ALTER TABLE wp_lfg ADD COLUMN IF NOT EXISTS session_queue text, ADD COLUMN IF NOT EXISTS session_start timestamptz`,
  `ALTER TABLE wp_duo_requests ADD COLUMN IF NOT EXISTS offered_role text, ADD COLUMN IF NOT EXISTS offered_voice boolean, ADD COLUMN IF NOT EXISTS offered_vibe text`,
  `ALTER TABLE wp_lfg ADD COLUMN IF NOT EXISTS partner_role text, ADD COLUMN IF NOT EXISTS play_windows int4multirange`,
];
