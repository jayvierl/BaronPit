import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { setBlock } from "@/lib/social";

export async function POST(req: Request) {
  const access = await requireUser(req, "protect");
  if (!access.ok) return access.response;
  const { user } = access;
  const { userId, block } = (await readObject(req)) as { userId?: number; block?: boolean };
  if (!validId(userId) || typeof block !== "boolean" || userId === user.id) return NextResponse.json({ ok: false, error: "Bad block." }, { status: 400 });
  await setBlock(user.id, userId, block);
  return NextResponse.json({ ok: true });
}
