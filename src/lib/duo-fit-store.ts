import { q } from "./db";
import { parseDuoFit, type DuoFit } from "./duo-fit";

export async function loadDuoFit(userId: number): Promise<DuoFit | null> {
  const [row] = await q`SELECT role, partner_role AS "partnerRole", blocks, vibe, communication
    FROM wp_duo_fit WHERE user_id=${userId}`;
  return row ? parseDuoFit(row) : null;
}

export async function saveDuoFit(userId: number, fit: DuoFit) {
  await q`INSERT INTO wp_duo_fit(user_id,role,partner_role,blocks,vibe,communication)
    VALUES(${userId},${fit.role},${fit.partnerRole},${fit.blocks}::text[],${fit.vibe},${fit.communication})
    ON CONFLICT(user_id) DO UPDATE SET role=excluded.role, partner_role=excluded.partner_role,
    blocks=excluded.blocks, vibe=excluded.vibe, communication=excluded.communication`;
}

export async function clearDuoFit(userId: number) {
  await q`DELETE FROM wp_duo_fit WHERE user_id=${userId}`;
}

// Filter within the eligible board before the page limit. The owner's listing always remains manageable.
export const filterByDuoFit = `LEFT JOIN wp_duo_fit f ON f.user_id=$1
  WHERE (NOT $3::bool OR b.user_id=$1 OR f.user_id IS NULL OR (
    (f.partner_role='Any' OR f.partner_role=ANY(b.roles) OR 'Fill'=ANY(b.roles)) AND
    (cardinality(f.blocks)=0 OR f.blocks && b.blocks) AND
    (f.vibe='both' OR b.vibe='both' OR f.vibe=b.vibe) AND
    (f.communication='any' OR (f.communication='voice' AND b.voice) OR (f.communication='text' AND NOT b.voice))))`;
