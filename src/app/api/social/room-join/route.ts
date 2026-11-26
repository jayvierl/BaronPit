import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { setRoomMembership } from "@/lib/social";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { roomId, join } = (await req.json().catch(() => ({}))) as { roomId?: number; join?: boolean };
  if (!roomId) return NextResponse.json({ ok: false, error: "Bad room." }, { status: 400 });
  await setRoomMembership(user.id, roomId, Boolean(join));
  return NextResponse.json({ ok: true });
}
