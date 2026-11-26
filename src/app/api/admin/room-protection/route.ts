import { authError, readObject, requireUser } from "@/lib/auth-http";
import { setRoomProtection } from "@/lib/room-safety";
export async function POST(req: Request) {
  const access = await requireUser(req, "staff");
  if (!access.ok) return access.response;
  const { slug, active } = await readObject(req);
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,90}$/.test(slug) || typeof active !== "boolean")
    return authError("Select a valid room and action.", 400);
  try {
    return (await setRoomProtection(access.user, slug, active))
      ? Response.json({ ok: true })
      : authError("This room or incident setting is unavailable.", 409);
  } catch {
    return authError("The room controls could not be updated.", 503);
  }
}
