import "server-only";

import { publicAvatar, type AvatarRef } from "./avatar";
import { getSql, queryRows } from "./db";

export const duoShortlistLimit = 50;

// Only the owner's settings affect the shortlist. A private mute by another
// player must not be discoverable through the public-profile pin control.
const canPin = `u.id <> $1 AND u.safety_status='visible' AND (u.banned_until IS NULL OR u.banned_until<=now())
  AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN (($1,u.id),(u.id,$1)))
  AND NOT EXISTS(SELECT 1 FROM wp_mutes m WHERE m.muter_id=$1 AND m.muted_id=u.id)`;

export type DuoShortlistPlayer = { id: number; name: string; hue: number; avatar: AvatarRef };

export async function duoShortlist(ownerId: number): Promise<{ players: DuoShortlistPlayer[]; hasUnavailable: boolean }> {
  const rows = await queryRows(`SELECT u.id,u.display_name,u.avatar_hue,u.avatar_ref,(${canPin}) AS available
    FROM wp_duo_shortlist s JOIN wp_users u ON u.id=s.player_id
    WHERE s.owner_id=$1 ORDER BY s.pinned_at DESC,u.id DESC LIMIT $2`, [ownerId, duoShortlistLimit]);
  const players = rows.filter(row => row.available === true).map(row => ({
    id: Number(row.id), name: String(row.display_name), hue: Number(row.avatar_hue), avatar: publicAvatar(row.avatar_ref),
  }));
  return { players, hasUnavailable: players.length !== rows.length };
}

export async function pinnedDuoIds(ownerId: number, playerIds: number[]): Promise<number[]> {
  if (playerIds.length === 0) return [];
  const rows = await queryRows(`SELECT u.id FROM wp_duo_shortlist s JOIN wp_users u ON u.id=s.player_id
    WHERE s.owner_id=$1 AND u.id=ANY($2::int[]) AND ${canPin}`, [ownerId, playerIds]);
  return rows.map(row => Number(row.id));
}

function lockShortlist(sql: Awaited<ReturnType<typeof getSql>>, ownerId: number) {
  return sql`SELECT pg_advisory_xact_lock(hashtextextended('wp_duo_shortlist:' || ${ownerId}::text, 0))`;
}

export async function clearUnavailableDuoPins(ownerId: number) {
  const sql = await getSql();
  await sql.transaction([lockShortlist(sql, ownerId), sql(`DELETE FROM wp_duo_shortlist s USING wp_users u
    WHERE s.owner_id=$1 AND s.player_id=u.id AND NOT (${canPin})`, [ownerId])]);
}

export async function changeDuoPin(ownerId: number, playerId: number, active: boolean) {
  if (ownerId === playerId) return "unavailable";
  const sql = await getSql();
  const [, , rows] = await sql.transaction([
    // Serialize the owner's size check and share the pair lock used by Block.
    lockShortlist(sql, ownerId),
    sql`SELECT pg_advisory_xact_lock(least(${ownerId}::int,${playerId}::int),greatest(${ownerId}::int,${playerId}::int))`,
    active ? sql(`WITH target AS (
      SELECT u.id FROM wp_users u WHERE u.id=$2 AND ${canPin}
    ), existing AS (
      SELECT 1 FROM wp_duo_shortlist WHERE owner_id=$1 AND player_id=$2
    ), inserted AS (
      INSERT INTO wp_duo_shortlist(owner_id,player_id) SELECT $1,id FROM target
      WHERE (SELECT count(*) FROM wp_duo_shortlist WHERE owner_id=$1)<$3
      ON CONFLICT DO NOTHING RETURNING player_id
    ) SELECT EXISTS(SELECT 1 FROM target) AS available,
      EXISTS(SELECT 1 FROM existing) OR EXISTS(SELECT 1 FROM inserted) AS pinned`, [ownerId, playerId, duoShortlistLimit])
      : sql`DELETE FROM wp_duo_shortlist WHERE owner_id=${ownerId} AND player_id=${playerId}`,
  ]);
  if (!active) return "removed";
  if (rows[0]?.available !== true) return "unavailable";
  return rows[0].pinned === true ? "pinned" : "full";
}
