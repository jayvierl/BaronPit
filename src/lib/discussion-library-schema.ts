export const librarySchema = [
  `CREATE TABLE IF NOT EXISTS wp_reposts (
    user_id int NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    post_id int NOT NULL REFERENCES wp_posts(id) ON DELETE CASCADE,
    first_shared_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true,
    PRIMARY KEY(user_id,post_id)
  )`,
  "CREATE INDEX IF NOT EXISTS wp_reposts_source ON wp_reposts(post_id)",
  "CREATE INDEX IF NOT EXISTS wp_reposts_following ON wp_reposts(user_id,first_shared_at DESC) WHERE active",
  `CREATE TABLE IF NOT EXISTS wp_discussion_saves (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id int NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    post_id int REFERENCES wp_posts(id) ON DELETE CASCADE,
    comment_id int REFERENCES wp_comments(id) ON DELETE CASCADE,
    CHECK (num_nonnulls(post_id, comment_id) = 1), UNIQUE(user_id,post_id), UNIQUE(user_id,comment_id)
  )`,
  "CREATE INDEX IF NOT EXISTS wp_discussion_saves_page ON wp_discussion_saves(user_id,id DESC)",
  `CREATE TABLE IF NOT EXISTS wp_thread_watches (
    user_id int NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    post_id int NOT NULL REFERENCES wp_posts(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,post_id)
  )`,
  "ALTER TABLE wp_thread_watches ADD COLUMN IF NOT EXISTS reply_mode text NOT NULL DEFAULT 'all' CHECK (reply_mode IN ('all','direct','muted'))",
  "ALTER TABLE wp_thread_watches ADD COLUMN IF NOT EXISTS direct_since timestamptz",
  "CREATE INDEX IF NOT EXISTS wp_comments_author_replies ON wp_comments(author_id,id) WHERE status='visible'",
  "CREATE INDEX IF NOT EXISTS wp_comments_parent_replies ON wp_comments(parent_id,id) WHERE parent_id IS NOT NULL AND status='visible'",
  `CREATE TABLE IF NOT EXISTS wp_discussion_read_replies (
    user_id int NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,
    comment_id int NOT NULL REFERENCES wp_comments(id) ON DELETE CASCADE, PRIMARY KEY(user_id,comment_id)
  )`,
];
