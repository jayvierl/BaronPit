import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { createPost, type CreatePostInput } from "@/lib/social";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted. Check your notices in your profile." }, { status: 403 });
  const input = (await req.json().catch(() => ({}))) as CreatePostInput;
  if (!["text", "build", "poll", "card", "clip", "media"].includes(input.kind)) {
    return NextResponse.json({ ok: false, error: "Unknown post kind." }, { status: 400 });
  }
  const result = await createPost(user, input);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, postId: result.postId, status: result.status });
}
