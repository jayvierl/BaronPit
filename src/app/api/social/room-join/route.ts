import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { setRoomMembership } from "@/lib/social";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { roomId, join } = (await readObject(req)) as { roomId?: number; join?: boolean };
  if (!validId(roomId) || typeof join !== "boolean") return NextResponse.json({ ok: false, error: "Bad room." }, { status: 400 });
  if (!await setRoomMembership(user.id, roomId, join)) return NextResponse.json({ok:false,error:"This room is unavailable."}, {status:404});
  return NextResponse.json({ ok: true, active: join });
}
