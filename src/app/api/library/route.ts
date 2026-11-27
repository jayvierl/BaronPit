import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { authError, readObject, requireUser } from "@/lib/auth-http";
import { changeLibrary, libraryState, setReplyMode } from "@/lib/discussion-library";
import { validId } from "@/lib/ids";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams;
  const kind = query.get("kind"), id = Number(query.get("id"));
  if ((kind !== "post" && kind !== "comment") || !validId(id)) return authError("Invalid item.", 400);
  try {
    const user = await getCurrentUser();
    if (!user) return authError("Sign in first.", 401);
    const state = await libraryState(user.id, kind, id);
    return state ? NextResponse.json({ ok: true, ...state }, { headers }) : authError("This item is unavailable.", 404);
  } catch { return authError("Your library is temporarily unavailable.", 503); }
}

export async function POST(req: Request) {
  const { action, kind, id, active, mode } = await readObject(req);
  if ((kind !== "post" && kind !== "comment") || !validId(id)) return authError("Invalid item.", 400);
  const changingMode = action === "reply-mode" && kind === "post" && (mode === "all" || mode === "muted" || mode === "direct");
  const toggling = (action === "save" || action === "watch" || action === "read" || action === "mute") && typeof active === "boolean";
  if (!changingMode && !toggling) return authError("Invalid action.", 400);
  const privateControl = changingMode ? mode !== "all" : active === false || action === "mute" || action === "read";
  const access = await requireUser(req, privateControl ? "protect" : "participate");
  if (!access.ok) return access.response;
  try {
    const ok = action === "reply-mode"
      ? changingMode && await setReplyMode(access.user.id, id, mode)
      : toggling && await changeLibrary(access.user.id, kind, id, action, active);
    return ok ? NextResponse.json({ ok: true }, { headers }) : authError("This item is unavailable.", 404);
  } catch { return authError("The update couldn’t be confirmed. Please try again.", 503); }
}
