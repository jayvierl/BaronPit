import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { toggleReaction } from "@/lib/social";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { kind, targetId, emoji } = (await req.json().catch(() => ({}))) as { kind?: string; targetId?: number; emoji?: string };
  if ((kind !== "post" && kind !== "comment") || !targetId || !emoji) {
    return NextResponse.json({ ok: false, error: "Bad reaction." }, { status: 400 });
  }
  const ok = await toggleReaction(user, kind, targetId, emoji);
  return NextResponse.json({ ok });
}
