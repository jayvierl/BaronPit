import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { toggleReaction } from "@/lib/social";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { kind, targetId, emoji, active } = (await readObject(req)) as { kind?: string; targetId?: number; emoji?: string; active?: boolean };
  if ((kind !== "post" && kind !== "comment") || !validId(targetId) || typeof emoji !== "string" || (active !== undefined && typeof active !== "boolean")) {
    return NextResponse.json({ ok: false, error: "Bad reaction." }, { status: 400 });
  }
  const ok = await toggleReaction(user, kind, targetId, emoji, active);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "This reaction is unavailable." }, { status: 400 });
}
