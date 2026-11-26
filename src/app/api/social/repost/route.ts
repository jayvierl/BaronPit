import { NextResponse } from "next/server";
import { inProbation } from "@/lib/account-policy";
import { rateLimit } from "@/lib/auth";
import { authError, readObject, requireUser } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { setRepost } from "@/lib/reposts";

export async function POST(req: Request) {
  const {postId, active} = await readObject(req);
  const access = await requireUser(req, active === false ? "protect" : "participate");
  if (!access.ok) return access.response;
  if (!validId(postId) || typeof active !== "boolean") return authError("Choose a post to repost.", 400);
  if (active && inProbation(access.user.createdAt)) return authError("You can repost after your first 24 hours.", 403);
  if (active && !await rateLimit(access.user.id, "repost", 12, 60)) return authError("You can repost up to 12 times an hour.", 429);
  if (!await setRepost(access.user.id, postId, active)) return authError("This post is unavailable to repost.", 404);
  return NextResponse.json({ok: true, active});
}
