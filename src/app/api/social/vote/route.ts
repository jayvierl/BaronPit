import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { castPollVote } from "@/lib/social";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { postId, optionIdx } = (await readObject(req)) as { postId?: number; optionIdx?: number };
  if (!validId(postId) || typeof optionIdx !== "number" || !Number.isSafeInteger(optionIdx)) return NextResponse.json({ ok: false, error: "Bad vote." }, { status: 400 });
  const result = await castPollVote(user, postId, optionIdx);
  if (result === "recorded") return NextResponse.json({ ok: true });
  if (result === "closed") return NextResponse.json({ ok: false, error: "Daily Call voting has closed." }, { status: 409 });
  return NextResponse.json({ ok: false, error: "This poll option is unavailable." }, { status: 400 });
}
