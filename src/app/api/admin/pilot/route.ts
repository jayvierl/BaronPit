import { authError, requireUser, readObject } from "@/lib/auth-http";
import { saveReview, validReview } from "@/lib/pilot";

export async function POST(req: Request) {
  const access = await requireUser(req, "staff");
  if (!access.ok) return access.response;
  const fields = await readObject(req);
  if (!validReview(fields))
    return authError("Choose a Monday through today and enter valid weekly totals.", 400);
  try {
    await saveReview(fields);
    return Response.json({ ok: true });
  } catch {
    return authError("The review could not be saved.", 503);
  }
}
