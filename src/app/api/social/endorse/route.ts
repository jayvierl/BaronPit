import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { endorse } from "@/lib/social";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { userId, kind } = (await readObject(req)) as { userId?: number; kind?: string };
  if (!validId(userId) || typeof kind !== "string") return NextResponse.json({ ok: false, error: "Bad endorsement." }, { status: 400 });
  const result = await endorse(user, userId, kind);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
