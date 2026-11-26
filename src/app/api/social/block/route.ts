import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { setBlock } from "@/lib/social";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { userId, block } = (await req.json().catch(() => ({}))) as { userId?: number; block?: boolean };
  if (!userId || userId === user.id) return NextResponse.json({ ok: false, error: "Bad block." }, { status: 400 });
  await setBlock(user.id, userId, Boolean(block));
  return NextResponse.json({ ok: true });
}
