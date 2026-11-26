import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { createLfg } from "@/lib/social";
import { q } from "@/lib/db";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    action?: string; listingId?: number;
    roles?: string[]; champs?: string[]; playTimes?: string; voice?: boolean; vibe?: string; note?: string; blocks?: string[];
  };
  if (body.action === "close") {
    if (!body.listingId) return NextResponse.json({ ok: false, error: "Bad listing." }, { status: 400 });
    await q`UPDATE wp_lfg SET status = 'closed' WHERE id = ${body.listingId} AND user_id = ${user.id}`;
    return NextResponse.json({ ok: true });
  }
  const result = await createLfg(user, {
    roles: (body.roles ?? []).slice(0, 3),
    champs: (body.champs ?? []).slice(0, 5),
    playTimes: body.playTimes ?? "",
    voice: Boolean(body.voice),
    vibe: body.vibe ?? "both",
    note: body.note ?? "",
    blocks: (body.blocks ?? []).slice(0, 8),
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, listingId: result.postId });
}
