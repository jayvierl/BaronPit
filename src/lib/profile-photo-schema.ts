import type { NeonQueryFunction } from "@neondatabase/serverless";

export function profilePhotoSchema(sql: NeonQueryFunction<false,false>) {
  return [
    sql`CREATE TABLE IF NOT EXISTS wp_profile_photos (
      id uuid PRIMARY KEY, user_id integer REFERENCES wp_users(id) ON DELETE SET NULL,
      uploader_id integer NOT NULL, original bytea, image bytea, original_hash text NOT NULL,
      content_hash text NOT NULL, status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','held','approved','rejected')),
      active boolean NOT NULL DEFAULT true, automated_clear boolean NOT NULL DEFAULT false,
      needs_human boolean NOT NULL, checked_at timestamptz, retry_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '48 hours',
      CHECK (octet_length(original)<=1048576 AND octet_length(image)<=131072),
      CHECK (original_hash ~ '^[0-9a-f]{64}$' AND content_hash ~ '^[0-9a-f]{64}$'),
      CHECK (status<>'approved' OR automated_clear))`,
    sql`CREATE INDEX IF NOT EXISTS wp_photos_owner ON wp_profile_photos(user_id,created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS wp_photos_expiry ON wp_profile_photos(expires_at)`,
    sql`CREATE INDEX IF NOT EXISTS wp_photos_retry ON wp_profile_photos(retry_at) WHERE NOT automated_clear AND status IN ('pending','held')`,
    sql`CREATE INDEX IF NOT EXISTS wp_photos_review ON wp_profile_photos(created_at,id) WHERE active AND status='held' AND automated_clear`,
    // No FK to user or asset: user removal and ordinary expiry cannot destroy protected evidence.
    sql`CREATE TABLE IF NOT EXISTS wp_profile_photo_evidence (
      id uuid PRIMARY KEY, uploader_id integer NOT NULL, original bytea NOT NULL, image bytea NOT NULL,
      original_hash text NOT NULL, content_hash text NOT NULL, source text NOT NULL,
      receipt uuid NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(),
      reported_at timestamptz, legal_hold boolean NOT NULL DEFAULT true)`,
    sql`CREATE INDEX IF NOT EXISTS wp_photo_receipts ON wp_profile_photo_evidence(receipt)`,
    sql`CREATE OR REPLACE FUNCTION wp_capture_reported_avatar() RETURNS trigger AS $$
      BEGIN
        IF NEW.target_kind='user' AND NEW.rule='child_safety'
          AND NOT EXISTS(SELECT 1 FROM wp_profile_photo_evidence e WHERE e.receipt=NEW.receipt AND e.source='scanner') THEN
          INSERT INTO wp_profile_photo_evidence(id,uploader_id,original,image,original_hash,content_hash,source,receipt)
            SELECT p.id,p.uploader_id,p.original,p.image,p.original_hash,p.content_hash,'profile_report',NEW.receipt
            FROM wp_profile_photos p JOIN wp_users u ON u.id=p.user_id
            WHERE u.id=NEW.target_id AND p.active AND p.original IS NOT NULL AND p.image IS NOT NULL
              AND u.avatar_ref=jsonb_build_object('kind','upload','id',p.id::text,'hash',p.content_hash)
            ON CONFLICT(id) DO NOTHING;
          UPDATE wp_profile_photos p SET active=false WHERE p.id IN (
            SELECT id FROM wp_profile_photo_evidence WHERE receipt=NEW.receipt);
          UPDATE wp_users u SET avatar_ref=NULL,profile_version=profile_version+1
            WHERE u.id=NEW.target_id AND EXISTS(SELECT 1 FROM wp_profile_photo_evidence e
              WHERE e.receipt=NEW.receipt AND u.avatar_ref=jsonb_build_object('kind','upload','id',e.id::text,'hash',e.content_hash));
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`,
    sql`CREATE OR REPLACE TRIGGER wp_capture_reported_avatar AFTER INSERT ON wp_safety_urgent
      FOR EACH ROW EXECUTE FUNCTION wp_capture_reported_avatar()`,
  ];
}
