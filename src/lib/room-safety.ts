import { q } from "./db";
import { isAdmin, isBanned, type User } from "./auth";

export function includesRoomLink(fields: string[]) {
  const link = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)|\b(?:[a-z0-9][a-z0-9-]*\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]+)\b/i;
  return fields.some(field => link.test(field));
}
export function roomWriteError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "PWR01")
    return "This room has paused links during an incident. Remove the link and try again.";
  if (code === "PWR02") return "This room is in slowmode. Wait 15 seconds between posts and replies.";
  if (code === "PWR03") return "That room is unavailable.";
  throw error;
}
export async function setRoomProtection(user: User, slug: string, active: boolean) {
  if (!isAdmin(user.email) || isBanned(user)) return false;
  const rows = await q`WITH changed AS (
    UPDATE wp_rooms SET raid_until=CASE WHEN ${active} THEN now()+interval '15 minutes' END
    WHERE slug=${slug} AND safety_status='visible'
      AND (${active} OR raid_until>now()) RETURNING id
  ), cleared AS (DELETE FROM wp_room_turns t USING changed c WHERE t.room_id=c.id)
  INSERT INTO wp_mod_log(target_kind,target_id,author_id,score,action,detail)
    SELECT 'room',id,${user.id},0,${active ? "raid_start" : "raid_end"},${active ? "Link pause and 15-second slowmode for 15 minutes" : "Room incident mode ended"} FROM changed RETURNING id`;
  return rows.length > 0;
}
export async function activeRoomProtections() {
  return q`SELECT slug,name,raid_until FROM wp_rooms WHERE raid_until>now() ORDER BY raid_until,slug LIMIT 200`;
}
export async function clearExpiredRoomTurns() {
  await q`DELETE FROM wp_room_turns WHERE available_at<=now()`;
}
