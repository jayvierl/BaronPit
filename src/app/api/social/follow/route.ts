import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { setFollow } from "@/lib/social";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { userId, follow } = (await readObject(req)) as { userId?: number; follow?: boolean };
  if (!validId(userId) || typeof follow !== "boolean") return NextResponse.json({ ok: false, error: "Bad follow." }, { status: 400 });
  if (!await setFollow(user.id, userId, follow)) return NextResponse.json({ok:false,error:"This player is unavailable."},{status:404});
  return NextResponse.json({ ok: true, active: follow });
}
