import { enrollDuoPilot, withdrawDuoPilot } from "@/lib/duo-pilot";
import { validId } from "@/lib/ids";
import { authError, requireUser, readObject } from "@/lib/auth-http";
import {
  joinPilot,
  leavePilot,
  pilotChannel,
  recordInterest,
  recordPilotVisit,
  validInterest,
} from "@/lib/pilot";

export async function POST(req: Request) {
  const data = await readObject(req);
  const access = await requireUser(
    req,
    data.action === "leave" || data.action === "leave-duo" || data.action === "visit" ? "protect" : "participate",
  );
  if (!access.ok) return access.response;
  try {
    if (data.action === "leave") {
      await leavePilot(access.user.id);
    } else if (data.action === "leave-duo") {
      await withdrawDuoPilot(access.user.id);
    } else if (data.action === "join-duo" && data.consent === true) {
      if (!(await enrollDuoPilot(access.user.id)))
        return authError("The duo study requires an eligible verified player and open matching.", 409);
    } else if (data.action === "join" && data.consent === true && pilotChannel(data.channel)) {
      if (!(await joinPilot(access.user, data.channel, data.role)))
        return authError(
          "Link your primary NA player and refresh its stats. Choose a role you played recently on a Silver, Gold or Platinum account.",
          409,
        );
    } else if (
      data.action === "visit" &&
      (data.kind === "social" || data.kind === "stats" || data.kind === "answer")
    ) {
      if (data.kind === "answer" && !validId(data.postId))
        return authError("That answer is unavailable.", 400);
      await recordPilotVisit(access.user.id, data.kind, data.postId);
    } else if (data.action === "interest" && data.consent === true && validInterest(data)) {
      await recordInterest(access.user.id, data);
    } else {
      return authError("Check your selections and consent before submitting.", 400);
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return authError("The pilot is temporarily unavailable. Try again shortly.", 503);
  }
}
