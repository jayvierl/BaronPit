export const quoteSchema = [
  `CREATE TABLE IF NOT EXISTS wp_quote_posts (
    post_id integer PRIMARY KEY REFERENCES wp_posts(id) ON DELETE CASCADE,
    original_post_id integer REFERENCES wp_posts(id) ON DELETE SET NULL,
    original_author_id integer REFERENCES wp_users(id) ON DELETE SET NULL,
    CHECK (post_id IS DISTINCT FROM original_post_id)
  )`,
  `CREATE INDEX IF NOT EXISTS wp_quote_posts_original ON wp_quote_posts(original_post_id) WHERE original_post_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS wp_quote_posts_original_author ON wp_quote_posts(original_author_id) WHERE original_author_id IS NOT NULL`,
];
