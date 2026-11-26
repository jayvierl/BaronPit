import { requireUser, readObject, authError } from "@/lib/auth-http";
import { submitAppeal } from "@/lib/safety-cases";
import { positiveId } from "@/lib/safety-policy";
export async function POST(req: Request) {
  const access = await requireUser(req, "protect");
  if (!access.ok) return access.response;
  const { id, message } = await readObject(req);
  if (!positiveId(id) || typeof message !== "string" || !message.trim() || message.length > 600)
    return authError("Explain your appeal in 1 to 600 characters.", 400);
  try {
    return (await submitAppeal(access.user, id, message.trim()))
      ? Response.json({ ok: true })
      : authError("This decision cannot accept another appeal.", 409);
  } catch {
    return authError("Your appeal could not be saved. Please try again.", 503);
  }
}
