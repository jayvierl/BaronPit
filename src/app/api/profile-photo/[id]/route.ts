import { getCurrentUser } from "@/lib/auth";
import { readPhoto } from "@/lib/profile-photo";
import { photoResponse } from "@/lib/profile-photo-response";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params, user=await getCurrentUser();
    const bytes=await readPhoto(user?.id??null,id,new URL(request.url).searchParams.get("v")??"");
    return photoResponse(bytes);
  } catch { return photoResponse(null,503); }
}
