import { getCurrentUser, rateLimit } from "@/lib/auth";
import { requireUser } from "@/lib/auth-http";
import { photoScanningEnabled } from "@/lib/profile-photo-scanner";
import { normalizePhoto, photoMimeTypes, readPhotoBody } from "@/lib/profile-photo-image";
import { photoStatus, removePhotos, stagePhoto } from "@/lib/profile-photo";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});
const error=(message:string,status:number)=>respond({ok:false,error:message},status);
export async function GET() {
  try {
    const user=await getCurrentUser();
    return user?respond(await photoStatus(user.id)):error("Sign in to manage your photo.",401);
  } catch { return error("Photo status is temporarily unavailable.",503); }
}
export async function POST(request: Request) {
  const auth=await requireUser(request);
  if (!auth.ok) return auth.response;
  if (!photoScanningEnabled()) return error("Photo uploads are waiting for private image screening.",503);
  const type=request.headers.get("content-type")?.toLowerCase()??"";
  if (!photoMimeTypes.includes(type)) return error("Choose a static JPEG, PNG or WebP image.",415);
  try {
    if (!await rateLimit(auth.user.id,"profile-photo",3,24*60)) return error("You can upload three photos per day.",429);
    const original=await readPhotoBody(request);
    if (!original) return error("Choose an image up to 1 MB.",413);
    const image=await normalizePhoto(original,type);
    if (!image) return error("Choose a static JPEG, PNG or WebP up to 2048 pixels on each side.",422);
    const result=await stagePhoto(auth.user.id,original,image);
    if (!result) return error("Your profile cannot upload this photo.",403);
    if ("error" in result) return error(result.error,409);
    return respond(result,result.status==="approved"?201:result.status==="rejected"?200:202);
  } catch { return error("Couldn’t confirm the photo upload. Check its status before trying again.",503); }
}
export async function DELETE(request: Request) {
  const auth=await requireUser(request,"protect");
  if (!auth.ok) return auth.response;
  try { await removePhotos(auth.user.id); return respond(await photoStatus(auth.user.id)); }
  catch { return error("Couldn’t confirm photo removal. Please try again.",503); }
}
