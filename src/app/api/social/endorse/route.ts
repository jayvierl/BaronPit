import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { endorse } from "@/lib/social";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { userId, kind } = (await req.json().catch(() => ({}))) as { userId?: number; kind?: string };
  if (!userId || !kind) return NextResponse.json({ ok: false, error: "Bad endorsement." }, { status: 400 });
  const result = await endorse(user, userId, kind);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
