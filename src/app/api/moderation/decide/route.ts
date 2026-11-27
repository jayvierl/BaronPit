import { authError, readObject } from "@/lib/auth-http";
import { checkModerationKey, decideModerationTarget } from "@/lib/moderation-queue";

export const dynamic = "force-dynamic";

/**
 * Server-to-server only: record and apply one automated-reviewer decision
 * on a held or flagged post/comment. Every decision writes a
 * wp_mod_decisions audit row and stays reversible from the admin queue.
 */
export async function POST(req: Request) {
  const check = checkModerationKey(req);
  if (check === "unconfigured") return authError("The moderation API is not configured.", 503);
  if (check !== "ok") return authError("Invalid moderation key.", 401);
  const body = await readObject(req);
  try {
    const result = await decideModerationTarget({
      targetType: body.targetType,
      targetId: body.targetId,
      decision: body.decision,
      reason: body.reason,
    });
    if (!result.ok) return authError(result.error, result.status);
    return Response.json(
      { ok: true, priorStatus: result.priorStatus, newStatus: result.newStatus },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return authError("The decision could not be saved. Check the queue and try again.", 503);
  }
}
