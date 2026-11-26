import { getCurrentUser } from "@/lib/auth";
import { readPhoto } from "@/lib/profile-photo";
import { photoResponse } from "@/lib/profile-photo-response";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try {
    const user=await getCurrentUser();
    if (!user) return photoResponse(null,401);
    const p=new URL(request.url).searchParams;
    return photoResponse(await readPhoto(user.id,p.get("id")??"",p.get("v")??"",true));
  } catch { return photoResponse(null,503); }
}
