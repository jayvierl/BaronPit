import { NextResponse } from "next/server";
import { requestMagicLink } from "@/lib/auth";
import { authError, emailOrigin, isSameOriginWrite, readObject } from "@/lib/auth-http";
import { isAgeBand } from "@/lib/account-policy";

export async function POST(req: Request) {
  if (!isSameOriginWrite(req)) return authError("Request your link from the sign-in page.",403);
  const base = emailOrigin(req);
  if (!base) return authError("Email sign-in is unavailable on this address.",503);
  const body = await readObject(req);
  const signup = body.mode === "signup";
  if (typeof body.email !== "string" || (signup && !isAgeBand(body.ageBand))) return authError("Check your email address and eligibility.",400);
  const ip = process.env.VERCEL
    ? (req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim()
    : "local";
  const result = await requestMagicLink(body.email, base, ip, signup, body.next);
  if (!result.ok) {
    if (result.error === "rate_limited") return authError("Too many requests. Try again in 15 minutes.",429);
    if (result.error === "invalid_email") return authError("That email address looks incomplete.",400);
    return authError("Email sign-in is temporarily unavailable. Please try again later.",503);
  }
  return NextResponse.json({ ok: true },{headers:{"Cache-Control":"private, no-store"}});
}
