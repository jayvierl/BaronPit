import { readObject, requireUser } from "@/lib/auth-http";
import { getSql } from "@/lib/db";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { puuid } = await readObject(req);
  if (typeof puuid !== "string" || !puuid || puuid.length > 128)
    return Response.json({ ok: false, error: "Choose a linked Riot account." }, { status: 400 });
  const sql = await getSql();
  const userId = auth.user.id;
  const [, rows] = await sql.transaction([
    sql`SELECT id FROM wp_users WHERE id=${userId} FOR UPDATE`,
    sql`UPDATE wp_links SET is_primary=(puuid=${puuid}) WHERE user_id=${userId} AND EXISTS (
      SELECT 1 FROM wp_links chosen WHERE chosen.user_id=${userId} AND chosen.puuid=${puuid} AND chosen.verified
        AND NOT EXISTS (SELECT 1 FROM wp_links contested WHERE contested.puuid=chosen.puuid AND contested.verified AND contested.user_id<>chosen.user_id))
      RETURNING is_primary`,
  ]);
  return rows.length ? Response.json({ ok: true }) : Response.json({ ok: false, error: "Choose a verified account you own." }, { status: 400 });
}
