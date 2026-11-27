import { getCurrentUser, isAdmin, isBanned } from "@/lib/auth";
import { authError, readObject, requireUser } from "@/lib/auth-http";
import { validPhotoHash, validPhotoId } from "@/lib/profile-photo";
import { readReviewPhoto, resolvePhoto } from "@/lib/profile-photo-review";

export const dynamic = "force-dynamic";
const privateHeaders = {"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff",
  "X-Robots-Tag":"noindex, nofollow", "Cross-Origin-Resource-Policy":"same-origin", Vary:"Cookie"};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id"), hash = params.get("hash");
  try {
    const user = await getCurrentUser();
    const bytes = user && isAdmin(user.email) && !isBanned(user) && validPhotoId(id) && validPhotoHash(hash)
      ? await readReviewPhoto(user, id, hash) : null;
    return bytes ? new Response(new Uint8Array(bytes), {headers:{...privateHeaders, "Content-Type":"image/webp"}})
      : new Response(null, {status:404, headers:privateHeaders});
  } catch {
    return new Response(null, {status:503, headers:privateHeaders});
  }
}

export async function POST(request: Request) {
  const access = await requireUser(request, "staff");
  if (!access.ok) return access.response;
  const {id, hash, approve} = await readObject(request);
  if (!validPhotoId(id) || !validPhotoHash(hash) || typeof approve !== "boolean") return authError("Invalid photo decision.",400);
  try {
    if (!await resolvePhoto(access.user,id,hash,approve)) return authError("This photo is no longer available for your review.",409);
    return Response.json({ok:true}, {headers:privateHeaders});
  } catch {
    return authError("Photo review is temporarily unavailable. Try again shortly.",503);
  }
}
