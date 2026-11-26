import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { authError, isSameOriginWrite } from "@/lib/auth-http";

export async function POST(req: Request) {
  if (!isSameOriginWrite(req)) return authError("Please sign out from the app.",403);
  try { await destroySession(); }
  catch { return authError("We couldn’t end the session. Please try signing out again.",503); }
  return NextResponse.json({ok:true});
}
