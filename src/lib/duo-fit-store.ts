import { cache } from "react";
import { q } from "./db";
import { parseDuoFit, type DuoFit } from "./duo-fit";

export const loadDuoFit = cache(async (userId: number): Promise<DuoFit | null> => {
  const [row] = await q`SELECT role, partner_role AS "partnerRole", blocks, vibe, communication, time_zone AS "timeZone"
    FROM wp_duo_fit WHERE user_id=${userId}`;
  return row ? parseDuoFit(row) : null;
});

export async function saveDuoFit(userId: number, fit: DuoFit) {
  await q`INSERT INTO wp_duo_fit(user_id,role,partner_role,blocks,vibe,communication,time_zone)
    VALUES(${userId},${fit.role},${fit.partnerRole},${fit.blocks}::text[],${fit.vibe},${fit.communication},${fit.timeZone ?? null})
    ON CONFLICT(user_id) DO UPDATE SET role=excluded.role, partner_role=excluded.partner_role,
    blocks=excluded.blocks, vibe=excluded.vibe, communication=excluded.communication, time_zone=excluded.time_zone`;
}

export async function clearDuoFit(userId: number) {
  await q`DELETE FROM wp_duo_fit WHERE user_id=${userId}`;
}

// Filter within the eligible board before the page limit. The owner's listing always remains manageable.
export const filterByDuoFit = `WHERE ($3::jsonb IS NULL OR b.user_id=$1 OR (
    ($3->>'partnerRole'='Any' OR $3->>'partnerRole'=ANY(b.roles) OR 'Fill'=ANY(b.roles)) AND
    b.partner_role IS NOT NULL AND (b.partner_role='Any' OR $3->>'role'='Fill' OR b.partner_role=$3->>'role') AND
    ($4::int4multirange IS NULL OR b.play_windows <@ $4::int4multirange) AND
    ($3->>'vibe'='both' OR b.vibe='both' OR $3->>'vibe'=b.vibe) AND
    ($3->>'communication'='any' OR ($3->>'communication'='voice' AND b.voice) OR ($3->>'communication'='text' AND NOT b.voice))))`;
