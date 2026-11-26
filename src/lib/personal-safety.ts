import "server-only";
import { q } from "./db";

export type SafetyPlayer = { id: number; name: string };

/** Only return the signed-in player's outgoing safety settings. */
export async function personalSafetyLists(ownerId: number) {
  const rows = await q`WITH settings AS (
    SELECT blocked_id AS player_id, 'block' AS kind FROM wp_blocks WHERE blocker_id=${ownerId}
    UNION ALL
    SELECT muted_id AS player_id, 'mute' AS kind FROM wp_mutes WHERE muter_id=${ownerId}
  ) SELECT u.id, CASE WHEN u.safety_status='visible' THEN u.display_name END AS name, s.kind
    FROM settings s JOIN wp_users u ON u.id=s.player_id ORDER BY u.id`;
  const blocked: SafetyPlayer[] = [];
  const muted: SafetyPlayer[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    const player = { id, name: typeof row.name === "string" ? row.name : `Unavailable player #${id}` };
    (row.kind === "block" ? blocked : muted).push(player);
  }
  return { blocked, muted };
}
