import { authError, readObject, requireUser } from "@/lib/auth-http";
import { checkDuoGame } from "@/lib/duo-game-check";
import { validId } from "@/lib/ids";

export async function POST(req: Request) {
  const auth = await requireUser(req, "participate");
  if (!auth.ok) return auth.response;
  const { id } = await readObject(req);
  if (!validId(id)) return authError("Invalid invitation.", 400);
  try {
    const result = await checkDuoGame(auth.user.id, id);
    return result.ok ? Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } })
      : authError(result.error, result.status);
  } catch {
    return authError("Game checks are temporarily unavailable. Try again shortly.", 503);
  }
}
