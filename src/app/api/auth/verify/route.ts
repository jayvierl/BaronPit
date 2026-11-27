import { NextResponse } from "next/server";
import { inspectMagicLink, redeemMagicLink, SESSION_COOKIE } from "@/lib/auth";
import { authError, isSameOriginWrite, readObject } from "@/lib/auth-http";
import { acceptedBand } from "@/lib/account-policy";

// Links already delivered by a previous deployment remain usable. A mail scanner
// following the GET cannot consume a token or establish a session.
export function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const location = /^[a-f0-9]{64}$/.test(token) ? "/signin/confirm#" + token : "/signin?error=expired";
  return new Response(null, { status:307, headers:{Location:location,"Referrer-Policy":"no-referrer","Cache-Control":"private, no-store"} });
}

export async function POST(req: Request) {
  if (!isSameOriginWrite(req)) return authError("Open the sign-in link in your browser.",403);
  const body = await readObject(req);
  try {
    const headers = { "Cache-Control":"private, no-store", "Referrer-Policy":"no-referrer" };
    if (body.action === "inspect") {
      const info = await inspectMagicLink(body.token);
      return info ? NextResponse.json({ok:true,...info},{headers}) : authError("That link expired or was already used.",410);
    }
    if (body.action !== "confirm") return authError("Confirm sign-in to continue.",400);
    const result = await redeemMagicLink(body.token,acceptedBand(body));
    if (!result) {
      const active = await inspectMagicLink(body.token);
      return active
        ? authError("Confirm your current age group and community terms. Recheck the link to continue.",409)
        : authError("That link expired or was already used.",410);
    }
    const res = NextResponse.json({ok:true,returnTo:result.returnTo},{headers});
    res.cookies.set(SESSION_COOKIE,result.sessionToken,{
      httpOnly:true, secure:!!process.env.VERCEL || new URL(req.headers.get("origin") || req.url).protocol === "https:", sameSite:"lax",path:"/",maxAge:30*24*60*60,
    });
    return res;
  } catch { return authError("Sign-in is temporarily unavailable. Please retry this link.",503); }
}
