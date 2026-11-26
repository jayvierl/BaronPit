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
    sql`ALTER TABLE wp_profile_photos ADD COLUMN IF NOT EXISTS scan_lease_id uuid`,
    sql`CREATE INDEX IF NOT EXISTS wp_photos_owner ON wp_profile_photos(user_id,created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS wp_photos_expiry ON wp_profile_photos(expires_at)`,
    sql`CREATE INDEX IF NOT EXISTS wp_photos_retry ON wp_profile_photos(retry_at) WHERE NOT automated_clear AND status IN ('pending','held')`,
    sql`CREATE INDEX IF NOT EXISTS wp_photos_review ON wp_profile_photos(created_at,id) WHERE active AND status='held' AND automated_clear`,
    // Older workers also reserve a scan via retry_at, even without writing a lease ID.
    sql`CREATE OR REPLACE FUNCTION wp_keep_scanning_photo() RETURNS trigger AS $$
      BEGIN
        RETURN NULL;
      END $$ LANGUAGE plpgsql`,
    sql`CREATE OR REPLACE TRIGGER wp_keep_scanning_photo BEFORE DELETE ON wp_profile_photos
      FOR EACH ROW WHEN (OLD.status IN ('pending','held') AND NOT OLD.automated_clear
        AND OLD.original IS NOT NULL AND OLD.retry_at>now()) EXECUTE FUNCTION wp_keep_scanning_photo()`,
    // No FK to user or asset: user removal and ordinary expiry cannot destroy protected evidence.
    sql`CREATE TABLE IF NOT EXISTS wp_profile_photo_evidence (
      id uuid PRIMARY KEY, uploader_id integer NOT NULL, original bytea NOT NULL, image bytea NOT NULL,
      original_hash text NOT NULL, content_hash text NOT NULL, source text NOT NULL,
      receipt uuid NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(),
      reported_at timestamptz, legal_hold boolean NOT NULL DEFAULT true)`,
    sql`CREATE INDEX IF NOT EXISTS wp_photo_receipts ON wp_profile_photo_evidence(receipt)`,
    // Explicit profile reports can capture the selected avatar even when an unrelated case is open.
    sql`DROP TRIGGER IF EXISTS wp_capture_reported_avatar ON wp_safety_urgent`,
    sql`DROP FUNCTION IF EXISTS wp_capture_reported_avatar()`,
    sql`CREATE OR REPLACE FUNCTION wp_capture_reported_avatar(account_id integer, case_receipt uuid) RETURNS void AS $$
      DECLARE captured_id uuid;
      BEGIN
        PERFORM id FROM wp_users WHERE id=account_id FOR UPDATE;
        INSERT INTO wp_profile_photo_evidence(id,uploader_id,original,image,original_hash,content_hash,source,receipt)
          SELECT p.id,p.uploader_id,p.original,p.image,p.original_hash,p.content_hash,'profile_report',case_receipt
          FROM wp_profile_photos p JOIN wp_users u ON u.id=p.user_id
          JOIN wp_safety_urgent c ON c.receipt=case_receipt AND c.target_kind='user' AND c.target_id=u.id AND c.reviewed_at IS NULL
          WHERE u.id=account_id AND p.active AND p.original IS NOT NULL AND p.image IS NOT NULL
            AND u.avatar_ref=jsonb_build_object('kind','upload','id',p.id::text,'hash',p.content_hash)
          ON CONFLICT(id) DO NOTHING RETURNING id INTO captured_id;
        IF captured_id IS NOT NULL THEN
          UPDATE wp_safety_urgent SET rule='child_safety',release_requested_by=NULL WHERE receipt=case_receipt;
          UPDATE wp_profile_photos SET active=false WHERE id=captured_id;
          UPDATE wp_users SET avatar_ref=NULL,profile_version=profile_version+1
            WHERE id=account_id AND avatar_ref->>'id'=captured_id::text;
        END IF;
      END $$ LANGUAGE plpgsql`,
    sql`CREATE OR REPLACE FUNCTION wp_capture_avatar_after_report() RETURNS trigger AS $$
      BEGIN
        PERFORM wp_capture_reported_avatar(NEW.target_id, c.receipt)
        FROM wp_safety_urgent c WHERE c.target_kind='user' AND c.target_id=NEW.target_id AND c.reviewed_at IS NULL;
        RETURN NULL;
      END $$ LANGUAGE plpgsql`,
    // Legacy and current report writers create the urgent receipt after inserting the report.
    sql`DROP TRIGGER IF EXISTS wp_capture_avatar_after_report ON wp_reports`,
    sql`CREATE CONSTRAINT TRIGGER wp_capture_avatar_after_report
      AFTER INSERT OR UPDATE OF category ON wp_reports DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW WHEN (NEW.target_kind='user' AND NEW.category='child_safety' AND NEW.status='open')
      EXECUTE FUNCTION wp_capture_avatar_after_report()`,
  ];
}
