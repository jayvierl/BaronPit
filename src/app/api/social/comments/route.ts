import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { getCurrentUser } from "@/lib/auth";
import { addComment, listComments } from "@/lib/social";

export async function GET(req: Request) {
  const postId = Number(new URL(req.url).searchParams.get("postId"));
  if (!validId(postId)) return NextResponse.json({ ok: false, comments: [] }, { status: 400 });
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ ok: true, comments: await listComments(postId, user) }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "Replies are unavailable. Please retry." }, { status: 503, headers });
  }
}

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { postId, body, parentId, oneFix, submitForReview } = (await readObject(req)) as { postId?: number; body?: string; parentId?: number; oneFix?: boolean; submitForReview?: boolean };
  if (!validId(postId) || typeof body !== "string" || (parentId != null && !validId(parentId)) || (oneFix != null && typeof oneFix !== "boolean") || (submitForReview != null && typeof submitForReview !== "boolean")) return NextResponse.json({ ok: false, error: "Missing comment." }, { status: 400 });
  const result = await addComment(user, postId, body, parentId, Boolean(oneFix), submitForReview === true);
  if (!result.ok) return NextResponse.json(result, { status: result.reconsider ? 422 : 400 });
  return NextResponse.json({ ok: true, commentId: result.postId, status: result.status });
}
