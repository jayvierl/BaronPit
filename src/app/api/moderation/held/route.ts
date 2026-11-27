import { authError } from "@/lib/auth-http";
import { checkModerationKey, listHeldItems } from "@/lib/moderation-queue";

export const dynamic = "force-dynamic";

/**
 * Server-to-server only: the automated reviewer's work queue. Auth is the
 * MODERATION_API_KEY header; an unset key disables the route (503), it
 * never fails open. No browser session is involved.
 */
export async function GET(req: Request) {
  const check = checkModerationKey(req);
  if (check === "unconfigured") return authError("The moderation API is not configured.", 503);
  if (check !== "ok") return authError("Invalid moderation key.", 401);
  try {
    const items = await listHeldItems();
    return Response.json(
      { ok: true, items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return authError("The moderation queue could not be loaded.", 503);
  }
}
