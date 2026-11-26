export const ownershipSchema = [
  `CREATE TABLE IF NOT EXISTS wp_riot_authorizations (
     user_id integer PRIMARY KEY REFERENCES wp_users(id) ON DELETE CASCADE,
     puuid text NOT NULL, state_hash text NOT NULL, expires_at timestamptz NOT NULL,
     FOREIGN KEY(user_id,puuid) REFERENCES wp_links(user_id,puuid) ON DELETE CASCADE)`,
];
