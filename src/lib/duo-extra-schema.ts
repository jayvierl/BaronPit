// No raw match or contact data is copied. The listing cleanup also clears these choices.
export const duoExtraSchema = [
  `ALTER TABLE wp_duo_requests
    ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
    ADD COLUMN IF NOT EXISTS sender_requeue boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS owner_requeue boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sender_thanked boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS owner_thanked boolean NOT NULL DEFAULT false`,
  // Older acceptances have no timestamp. Only a game played after the upgrade can qualify them.
  "UPDATE wp_duo_requests SET accepted_at=now() WHERE status='accepted' AND accepted_at IS NULL",
];
