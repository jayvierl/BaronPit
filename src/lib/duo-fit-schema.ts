// One private preference row per account. No contact information or match data.
export const duoFitSchema = [
  `CREATE TABLE IF NOT EXISTS wp_duo_fit (
    user_id int PRIMARY KEY REFERENCES wp_users(id) ON DELETE CASCADE,
    role text NOT NULL, partner_role text NOT NULL, blocks text[] NOT NULL,
    vibe text NOT NULL, communication text NOT NULL)`,
];
