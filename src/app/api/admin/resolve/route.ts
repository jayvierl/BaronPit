import { requireUser, readObject, authError } from "@/lib/auth-http";
import { escalateCase, resolveCase, reviewAppeal } from "@/lib/safety-cases";
import { positiveId, isKind, isDecision, isRule } from "@/lib/safety-policy";
export async function POST(req: Request) {
  const access = await requireUser(req, "staff");
  if (!access.ok) return access.response;
  const b = await readObject(req);
  let confirmed: boolean | "second_review";
  try {
    if (b.kind === "appeal") {
      if (
        !positiveId(b.id) ||
        (b.action !== "overturn" && b.action !== "uphold") ||
        typeof b.reason !== "string" ||
        !b.reason.trim() ||
        b.reason.length > 400
      )
        return authError("Include a short explanation of the appeal decision.", 400);
      confirmed = await reviewAppeal(access.user, b.id, b.action === "overturn", b.reason.trim());
    } else if (b.action === "escalate" && isKind(b.kind) && positiveId(b.id) && isRule(b.rule)) {
      confirmed = await escalateCase(access.user, b.kind, b.id, b.rule);
    } else {
      if (!positiveId(b.id) || !isKind(b.kind) || !isRule(b.rule) || !isDecision(b.action))
        return authError("Choose a valid case, rule and decision.", 400);
      confirmed = await resolveCase(access.user, b.kind, b.id, b.action, b.rule);
    }
  } catch {
    return authError("The decision could not be saved. Check the queue and try again.", 503);
  }
  return confirmed
    ? Response.json({ ok: true, pendingIndependentReview: confirmed === "second_review" })
    : authError("This case is unavailable, already resolved, or requires a different reviewer.", 409);
}
