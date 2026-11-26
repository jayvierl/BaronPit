import type { NeonQueryFunction } from "@neondatabase/serverless";

export function duoSchema(sql: NeonQueryFunction<false, false>) {
  return [
    sql`ALTER TABLE wp_posts ADD COLUMN IF NOT EXISTS clip_review_required BOOLEAN NOT NULL DEFAULT false`,
    sql`ALTER TABLE wp_lfg ADD COLUMN IF NOT EXISTS safe_listing BOOLEAN NOT NULL DEFAULT false`,
    sql`CREATE TABLE IF NOT EXISTS wp_duo_requests (
      id SERIAL PRIMARY KEY, listing_id INT NOT NULL REFERENCES wp_lfg(id) ON DELETE CASCADE,
      sender_id INT NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE, sender_puuid TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(listing_id,sender_id))`,
    sql`CREATE INDEX IF NOT EXISTS wp_duo_sender_recent ON wp_duo_requests(sender_id,created_at)`,
    sql`CREATE INDEX IF NOT EXISTS wp_lfg_recent_open ON wp_lfg(expires_at) WHERE safe_listing AND status='open'`,
    sql`ALTER TABLE wp_endorsements ADD COLUMN IF NOT EXISTS interaction_checked BOOLEAN NOT NULL DEFAULT false`,
  ];
}
