import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/auth";
import { authError, readObject, requireUser } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { q } from "@/lib/db";

export async function POST(req: Request) {
  const { postId, closed } = await readObject(req);
  if (!validId(postId) || typeof closed !== "boolean") return authError("Choose a discussion and a reply setting.", 400);
  const access = await requireUser(req, closed ? "protect" : "participate");
  if (!access.ok) return access.response;
  try {
    if (!await rateLimit(access.user.id, "reply-policy", 50, 60)) return authError("Too many reply setting changes. Try again later.", 429);
    const [updated] = await q`UPDATE wp_posts SET replies_closed=${closed} WHERE id=${postId}
      AND author_id=${access.user.id} AND status='visible' AND withdrawn_at IS NULL RETURNING replies_closed`;
    return updated ? NextResponse.json({ok:true, closed:updated.replies_closed}, {headers:{"Cache-Control":"private, no-store"}})
      : authError("This discussion is unavailable.",404);
  } catch { return authError("Reply settings are temporarily unavailable.",503); }
}
