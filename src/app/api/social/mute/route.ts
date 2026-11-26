import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { setMute } from "@/lib/social";

export async function POST(req: Request) {
  const access = await requireUser(req, "protect");
  if (!access.ok) return access.response;
  const { user } = access;
  const { userId, mute } = (await readObject(req)) as { userId?: number; mute?: boolean };
  if (!validId(userId) || typeof mute !== "boolean" || userId === user.id) return NextResponse.json({ ok: false, error: "Bad mute." }, { status: 400 });
  await setMute(user.id, userId, mute);
  return NextResponse.json({ ok: true });
}
