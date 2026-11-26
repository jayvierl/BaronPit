export const communityObjectiveSchema = [
  // The existing feed and visible-comment indexes already support their UTC range predicates.
  "CREATE INDEX IF NOT EXISTS wp_visible_game_card_recent ON wp_posts(created_at DESC,id DESC) WHERE kind='card' AND status='visible' AND card_validated",
  "CREATE INDEX IF NOT EXISTS wp_post_reactions_recent ON wp_reactions(created_at,user_id,target_id) WHERE target_kind='post'",
];
