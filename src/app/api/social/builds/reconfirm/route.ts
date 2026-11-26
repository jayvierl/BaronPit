import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { reconfirmBuild } from "@/lib/social";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { postId } = (await readObject(req)) as { postId?: number };
  if (!validId(postId)) return NextResponse.json({ ok: false, error: "Missing build." }, { status: 400 });
  const result = await reconfirmBuild(user, postId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
