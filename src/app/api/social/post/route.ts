import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { createPost, type CreatePostInput } from "@/lib/social";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const input = (await readObject(req)) as CreatePostInput & { expectedAuthorId?: number };
  if (input.expectedAuthorId !== undefined && input.expectedAuthorId !== user.id)
    return NextResponse.json({ ok: false, error: "Your signed-in account changed. Refresh before posting." }, { status: 409 });
  if (typeof input.body !== "string" || input.body.length > 2000 || (input.roomId != null && !validId(input.roomId))
      || (input.data != null && (typeof input.data !== "object" || Array.isArray(input.data) || JSON.stringify(input.data).length > 16384))) {
    return NextResponse.json({ ok:false,error:"Check the post text, room and attachment." }, {status:400});
  }
  if (input.kind === "poll" && (!Array.isArray(input.data?.options) || !input.data.options.every(o=>typeof o === "string" && o.trim()))) {
    return NextResponse.json({ ok:false, error:"Enter the choices for this poll." }, {status:400});
  }
  if (!["text", "build", "poll", "card", "clip", "media"].includes(input.kind)) {
    return NextResponse.json({ ok: false, error: "Unknown post kind." }, { status: 400 });
  }
  const result = await createPost(user, { ...input, submitForReview: input.submitForReview === true });
  if (!result.ok) return NextResponse.json(result, { status: result.reconsider ? 409 : 400 });
  return NextResponse.json({ ok: true, postId: result.postId, status: result.status });
}
