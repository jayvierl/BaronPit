import { NextResponse } from "next/server";
import { authError, requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { getCurrentUser } from "@/lib/auth";
import { addComment, listComments } from "@/lib/social";

export async function GET(req: Request) {
  const postId = Number(new URL(req.url).searchParams.get("postId"));
  if (!validId(postId)) return NextResponse.json({ ok: false, comments: [] }, { status: 400 });
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    const expected = req.headers.get("x-expected-viewer");
    if (expected !== null && expected !== String(user?.id ?? "guest")) {
      return authError("Your signed-in account changed. Refresh to see replies.", 409);
    }
    return NextResponse.json({ ok: true, comments: await listComments(postId, user) }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "Replies are unavailable. Please retry." }, { status: 503, headers });
  }
}

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { postId, body, parentId, oneFix, submitForReview, submissionId, expectedAuthorId } = await readObject(req);
  if (expectedAuthorId !== undefined && expectedAuthorId !== user.id) {
    return authError("Your signed-in account changed. Refresh before posting.", 409);
  }
  if (!validId(postId) || typeof body !== "string" || (parentId != null && !validId(parentId)) ||
      (oneFix != null && typeof oneFix !== "boolean") || (submitForReview != null && typeof submitForReview !== "boolean") ||
      (submissionId != null && typeof submissionId !== "string")) return authError("Check the reply and try again.", 400);
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const result = await addComment(user, postId, body, parentId ?? undefined, oneFix === true, submitForReview === true, submissionId ?? null);
    if (!result.ok) return NextResponse.json(result, { status: result.reconsider ? 422 : 400, headers });
    return NextResponse.json({ ok: true, commentId: result.postId, status: result.status }, { headers });
  } catch { return authError("Your reply couldn’t be confirmed. Try sending it again.", 503); }
}
