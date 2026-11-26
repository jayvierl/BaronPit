import { validId } from "@/lib/ids";
import { requireUser } from "@/lib/auth-http";
import { closeDuoListing, createDuoListing, duoAction, duoPeerId, setRequeue, thankDuo } from "@/lib/duo";
import { setBlock } from "@/lib/social";

function reply(result: { ok: boolean; error?: string }, status?: number) {
  return Response.json(result, {
    status: status ?? (result.ok ? 200 : 400),
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return reply({ ok: false, error: "Invalid duo request." });
  const input = body as Record<string, unknown>;
  const action = input.action;
  const protectedAction =
    action === "withdraw-requeue" || action === "close" || action === "decline" || action === "block-listing" || action === "block-request";
  const auth = await requireUser(req, protectedAction ? "protect" : "participate");
  if (!auth.ok) return auth.response;
  const { user } = auth;
  if (action === "create") return reply(await createDuoListing(user, input));
  const id = input.id;
  if (!validId(id)) return reply({ ok: false, error: "Invalid selection." });
  if (action === "thank") {
    if (Object.keys(input).some(key => key !== "action" && key !== "id"))
      return reply({ ok: false, error: "This action sends a free thank-you only." });
    return reply(await thankDuo(user.id, id));
  }
  if (action === "requeue" || action === "withdraw-requeue") return reply(await setRequeue(user.id, id, action === "requeue"));
  if (action === "close") return reply(await closeDuoListing(user.id, id));
  if (action === "block-listing" || action === "block-request") {
    const peer = await duoPeerId(user.id, action === "block-listing" ? "lfg" : "duo_request", id);
    if (!peer) return reply({ ok: false, error: "This entry is no longer available." }, 404);
    await setBlock(user.id, peer, true);
    return reply({ ok: true });
  }
  if (action === "request" || action === "accept" || action === "decline")
    return reply(await duoAction(user, id, action, input));
  return reply({ ok: false, error: "Unknown duo action." });
}
