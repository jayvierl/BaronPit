import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { addComment, listComments } from "@/lib/social";

export async function GET(req: Request) {
  const postId = Number(new URL(req.url).searchParams.get("postId"));
  if (!postId) return NextResponse.json({ ok: false, comments: [] }, { status: 400 });
  const user = await getCurrentUser();
  const comments = await listComments(postId, user).catch(() => []);
  return NextResponse.json({ ok: true, comments });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { postId, body, parentId, oneFix } = (await req.json().catch(() => ({}))) as { postId?: number; body?: string; parentId?: number; oneFix?: boolean };
  if (!postId || !body) return NextResponse.json({ ok: false, error: "Missing comment." }, { status: 400 });
  const result = await addComment(user, postId, body, parentId, Boolean(oneFix));
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, commentId: result.postId, status: result.status });
}
