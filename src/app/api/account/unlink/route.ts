import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { q } from "@/lib/db";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { puuid } = (await req.json().catch(() => ({}))) as { puuid?: string };
  if (!puuid) return NextResponse.json({ ok: false, error: "Bad unlink." }, { status: 400 });
  await q`DELETE FROM wp_links WHERE user_id = ${user.id} AND puuid = ${puuid}`;
  return NextResponse.json({ ok: true });
}
