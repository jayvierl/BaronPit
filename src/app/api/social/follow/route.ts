import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { setFollow } from "@/lib/social";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { userId, follow } = (await req.json().catch(() => ({}))) as { userId?: number; follow?: boolean };
  if (!userId) return NextResponse.json({ ok: false, error: "Bad follow." }, { status: 400 });
  await setFollow(user.id, userId, Boolean(follow));
  return NextResponse.json({ ok: true });
}
