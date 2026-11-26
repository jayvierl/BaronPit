import { NextResponse } from "next/server";
import { readObject, requireUser } from "@/lib/auth-http";
import { validId } from "@/lib/ids";
import { withdrawSubmission } from "@/lib/submissions";

export async function POST(req: Request) {
  const access = await requireUser(req, "protect");
  if (!access.ok) return access.response;
  const {kind, id} = await readObject(req);
  if ((kind !== "post" && kind !== "comment") || !validId(id)) {
    return NextResponse.json({ok:false,error:"Choose one of your posts or replies."},{status:400});
  }
  if (!await withdrawSubmission(access.user.id,kind,id)) {
    return NextResponse.json({ok:false,error:"This submission is unavailable."},{status:404});
  }
  return NextResponse.json({ok:true,status:"withdrawn"});
}
