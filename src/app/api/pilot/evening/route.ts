import { authError, readObject, requireUser } from "@/lib/auth-http";
import { clearEveningChoice, recordFitBoardDay, saveEveningChoice, setArrivalConsent } from "@/lib/duo-evening";

export async function POST(req: Request) {
  const data = await readObject(req);
  const withdraw = data.action === "clear" || data.action === "stop-sampling";
  const access = await requireUser(req, withdraw ? "protect" : "participate");
  if (!access.ok) return access.response;
  const id = access.user.id;
  try {
    switch (data.action) {
      case "clear": await clearEveningChoice(id); break;
      case "save":
        if (data.consent !== true || !(await saveEveningChoice(id, data.role, data.start)))
          return authError("Refresh the proposed time and confirm your adult NA availability.", 400);
        break;
      case "stop-sampling": await setArrivalConsent(id, false); break;
      case "sample":
        if (data.consent !== true || !(await setArrivalConsent(id, true)))
          return authError("Join the verified Duo Finder study before adding this optional measurement.", 409);
        break;
      case "visit": await recordFitBoardDay(id); break;
      default: return authError("Choose a supported pilot action.", 400);
    }
    return Response.json({ok: true}, {headers: {"Cache-Control": "private, no-store"}});
  } catch {
    return authError("The pilot could not update. Try again shortly.", 503);
  }
}
