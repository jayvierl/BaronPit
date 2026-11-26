import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { getSql } from "@/lib/db";

export async function POST(req: Request) {
  const access = await requireUser(req, "protect");
  if (!access.ok) return access.response;
  const { user } = access;
  const { puuid } = (await readObject(req)) as { puuid?: string };
  if (typeof puuid !== "string" || !puuid || puuid.length>128) return NextResponse.json({ ok: false, error: "Bad unlink." }, { status: 400 });
  const sql=await getSql();
  await sql.transaction([
    sql`SELECT id FROM wp_users WHERE id=${user.id} FOR UPDATE`,
    sql`WITH removed AS (
      DELETE FROM wp_links WHERE user_id=${user.id} AND puuid=${puuid} RETURNING puuid
    ) UPDATE wp_links SET is_primary=true WHERE user_id=${user.id} AND puuid=(
      SELECT puuid FROM wp_links WHERE user_id=${user.id} AND puuid<>${puuid} ORDER BY created_at,puuid LIMIT 1
    ) AND EXISTS (SELECT 1 FROM removed)
      AND NOT EXISTS (SELECT 1 FROM wp_links WHERE user_id=${user.id} AND puuid<>${puuid} AND is_primary)`,
  ]);
  return NextResponse.json({ ok: true });
}
