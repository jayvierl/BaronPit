/** Run after the base post and comment tables in the schema transaction. */
export const moderationDecisionsSchema = [
  // Audit log for the key-held moderation API (moderation-automation spec).
  // One row per Lyris decision on a held or flagged item; the admin queue
  // stays the system of record, so every row here is reversible from there.
  `CREATE TABLE IF NOT EXISTS wp_mod_decisions (
    id serial PRIMARY KEY,
    operation uuid NOT NULL UNIQUE,
    target_kind text NOT NULL CHECK (target_kind IN ('post','comment')),
    target_id integer NOT NULL,
    decision text NOT NULL CHECK (decision IN ('approve','deny')),
    reason text NOT NULL DEFAULT '',
    actor text NOT NULL DEFAULT 'lyris',
    prior_status text NOT NULL DEFAULT '',
    new_status text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS wp_mod_decisions_target ON wp_mod_decisions(target_kind,target_id,created_at DESC)`,
];
