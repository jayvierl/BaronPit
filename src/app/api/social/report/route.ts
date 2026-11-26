import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { reportTarget } from "@/lib/social";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { kind, targetId, reason } = (await req.json().catch(() => ({}))) as { kind?: string; targetId?: number; reason?: string };
  if (!kind || !targetId || !["post", "comment", "user", "lfg"].includes(kind)) {
    return NextResponse.json({ ok: false, error: "Bad report." }, { status: 400 });
  }
  const result = await reportTarget(user, kind, targetId, reason ?? "");
  return NextResponse.json({ ok: result.ok });
}
