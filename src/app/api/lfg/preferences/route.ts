import { authError, readObject, requireUser } from "@/lib/auth-http";
import { clearDuoFit, saveDuoFit } from "@/lib/duo-fit-store";
import { parseDuoFit } from "@/lib/duo-fit";

export async function POST(req: Request) {
  const data = await readObject(req);
  const clear = data.action === "clear";
  const access = await requireUser(req, clear ? "protect" : "participate");
  if (!access.ok) return access.response;
  try {
    if (clear) {
      await clearDuoFit(access.user.id);
    } else {
      const fit = parseDuoFit(data);
      if (data.action !== "save" || !fit) return authError("Check your role and partner preferences.", 400);
      await saveDuoFit(access.user.id, fit);
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return authError("Your preferences couldn’t be updated. Please try again.", 503);
  }
}
