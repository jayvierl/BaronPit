import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { getSql } from "@/lib/db";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { puuid } = (await readObject(req)) as { puuid?: string };
  if (typeof puuid !== "string" || !puuid || puuid.length>128) return NextResponse.json({ ok: false, error: "Bad unlink." }, { status: 400 });
  const sql=await getSql();
  await sql.transaction([
    sql`SELECT id FROM wp_users WHERE id=${user.id} FOR UPDATE`,
    sql`DELETE FROM wp_links WHERE user_id=${user.id} AND puuid=${puuid}`,
    sql`UPDATE wp_links SET is_primary=true WHERE user_id=${user.id} AND puuid=(
      SELECT puuid FROM wp_links WHERE user_id=${user.id} ORDER BY created_at,puuid LIMIT 1)
      AND NOT EXISTS(SELECT 1 FROM wp_links WHERE user_id=${user.id} AND is_primary)`,
  ]);
  return NextResponse.json({ ok: true });
}
