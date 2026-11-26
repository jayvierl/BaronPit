import { requireUser, readObject, authError } from "@/lib/auth-http";
import { fileReport } from "@/lib/safety-cases";
import { isKind, isRule, positiveId } from "@/lib/safety-policy";
export async function POST(req: Request) {
  const access = await requireUser(req, "protect");
  if (!access.ok) return access.response;
  const { kind, targetId, category = "other", reason = "" } = await readObject(req);
  if (
    !isKind(kind) ||
    !positiveId(targetId) ||
    !isRule(category) ||
    typeof reason !== "string" ||
    reason.length > 300
  )
    return authError("Choose an item and a report category.", 400);
  try {
    const result = await fileReport(access.user, kind, targetId, category, reason);
    if (result.error) return authError(result.error, result.status);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return authError("We couldn’t save your report. Try again or use the safety contact.", 503);
  }
}
