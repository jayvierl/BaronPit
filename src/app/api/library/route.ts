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
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { action, kind, id, active, mode } = await readObject(req);
  if ((kind !== "post" && kind !== "comment") || !validId(id)) return authError("Invalid item.", 400);
  try {
    let ok: boolean;
    if (action === "reply-mode" && kind === "post" && (mode === "all" || mode === "muted" || mode === "direct")) {
      ok = await setReplyMode(access.user.id, id, mode);
    } else if ((action === "save" || action === "watch" || action === "read" || action === "mute") && typeof active === "boolean") {
      ok = await changeLibrary(access.user.id, kind, id, action, active);
    } else {
      return authError("Invalid action.", 400);
    }
    return ok ? NextResponse.json({ ok: true }, { headers }) : authError("This item is unavailable.", 404);
  } catch { return authError("The update couldn’t be confirmed. Please try again.", 503); }
}
