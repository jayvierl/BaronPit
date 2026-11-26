import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { votePoll } from "@/lib/social";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { postId, optionIdx } = (await req.json().catch(() => ({}))) as { postId?: number; optionIdx?: number };
  if (!postId || optionIdx == null) return NextResponse.json({ ok: false, error: "Bad vote." }, { status: 400 });
  const ok = await votePoll(user, postId, optionIdx);
  return NextResponse.json({ ok });
}
