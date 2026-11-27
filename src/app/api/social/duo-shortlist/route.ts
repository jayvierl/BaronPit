import { NextResponse } from "next/server";
import { authError, isSameOriginWrite, readObject, requireUser } from "@/lib/auth-http";
import { changeDuoPin, clearUnavailableDuoPins } from "@/lib/duo-shortlist";
import { validId } from "@/lib/ids";

export async function POST(req: Request) {
  if (!isSameOriginWrite(req)) return authError("Please submit this action from the app.", 403);
  const { playerId, active, action } = await readObject(req);
  const clearUnavailable = action === "clear-unavailable";
  const access = await requireUser(req, clearUnavailable || active === false ? "protect" : "participate");
  if (!access.ok) return access.response;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (clearUnavailable) {
      await clearUnavailableDuoPins(access.user.id);
      return NextResponse.json({ ok: true }, { headers });
    }
    if (!validId(playerId) || playerId === access.user.id || typeof active !== "boolean") {
      return authError("Choose another player.", 400);
    }
    const result = await changeDuoPin(access.user.id, playerId, active);
    if (result === "unavailable") return authError("This player is unavailable.", 404);
    if (result === "full") return authError("Your Duo shortlist is full. Remove a player to add another.", 409);
    return NextResponse.json({ ok: true, active: result === "pinned" }, { headers });
  } catch {
    return authError("The shortlist change couldn’t be confirmed. Please try again.", 503);
  }
}
