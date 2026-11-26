import { authError, readObject, requireUser } from "@/lib/auth-http";
import { observeFeaturedStep, startFeaturedSample } from "@/lib/featured-sample";
import { validId } from "@/lib/ids";

export async function POST(req: Request) {
  const access = await requireUser(req, "participate");
  if (!access.ok) return access.response;
  const data = await readObject(req);
  if (!validId(data.postId)) return authError("The discussion is unavailable.", 400);
  try {
    if (data.action === "start" && data.consent === true) {
      if (!(await startFeaturedSample(access.user.id, data.postId)))
        return authError("This sample has already been counted or is unavailable for your enrollment.", 409);
    } else if (data.action === "observe" && validId(data.featuredId)) {
      if (!(await observeFeaturedStep(access.user.id, data.featuredId, data.postId)))
        return authError("The sample has ended or this discussion is ineligible.", 409);
    } else return authError("Choose whether to take part.", 400);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return authError("The sample could not be saved.", 503);
  }
}
