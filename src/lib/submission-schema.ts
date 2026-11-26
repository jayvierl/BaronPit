import type { NeonQueryFunction } from "@neondatabase/serverless";

export function submissionSchema(sql: NeonQueryFunction<false, false>) {
  return [
    sql`ALTER TABLE wp_posts ADD COLUMN IF NOT EXISTS submission_id uuid, ADD COLUMN IF NOT EXISTS submission_hash text, ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz`,
    sql`ALTER TABLE wp_comments ADD COLUMN IF NOT EXISTS submission_id uuid, ADD COLUMN IF NOT EXISTS submission_hash text, ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS wp_post_submission ON wp_posts(author_id,submission_id) WHERE submission_id IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS wp_comment_submission ON wp_comments(author_id,submission_id) WHERE submission_id IS NOT NULL`,
    sql`CREATE INDEX IF NOT EXISTS wp_post_receipts ON wp_posts(author_id,created_at DESC,id DESC)`,
    sql`CREATE INDEX IF NOT EXISTS wp_comment_receipts ON wp_comments(author_id,created_at DESC,id DESC)`,
    // Safety staff can still hold/remove and adjudicate a withdrawn item. An approval or appeal
    // must never put the author's content back on public surfaces, including on older instances.
    sql`CREATE OR REPLACE FUNCTION wp_guard_withdrawal() RETURNS trigger AS $$
      BEGIN
        NEW.withdrawn_at := coalesce(OLD.withdrawn_at, NEW.withdrawn_at);
        IF NEW.withdrawn_at IS NOT NULL AND NEW.status='visible' THEN NEW.status := 'withdrawn'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`,
    sql`CREATE OR REPLACE TRIGGER wp_post_withdrawal_guard BEFORE UPDATE OF status,withdrawn_at ON wp_posts
      FOR EACH ROW EXECUTE FUNCTION wp_guard_withdrawal()`,
    sql`CREATE OR REPLACE TRIGGER wp_comment_withdrawal_guard BEFORE UPDATE OF status,withdrawn_at ON wp_comments
      FOR EACH ROW EXECUTE FUNCTION wp_guard_withdrawal()`,
  ];
}
