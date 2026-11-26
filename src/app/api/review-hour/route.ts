import { authError, readObject, requireUser } from "@/lib/auth-http";
import { confirmReviewHost, withdrawReviewHost } from "@/lib/community-review";
import { isPilotHost } from "@/lib/pilot";
import { reviewHour } from "@/lib/review-hour-time";

export async function POST(req: Request) {
  const data = await readObject(req);
  const withdraw = data.action === "withdraw";
  const access = await requireUser(req, withdraw ? "protect" : "participate");
  if (!access.ok) return access.response;
  if (!withdraw && !isPilotHost(access.user))
    return authError("Only designated hosts can confirm a slot.", 403);
  if ((!withdraw && data.action !== "confirm") || (data.role !== "Bot" && data.role !== "Support"))
    return authError("Choose a host slot for this session.", 400);
  const session = reviewHour();
  if (data.start !== session.start)
    return authError("This review hour has ended. Refresh for the next one.", 409);
  try {
    if (withdraw) await withdrawReviewHost(access.user.id, session.start, data.role);
    else if (!(await confirmReviewHost(access.user.id, session.start, data.role)))
      return authError("That slot is unavailable. You can host one role per review hour.", 409);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return authError("The host list could not be updated. Try again shortly.", 503);
  }
}
