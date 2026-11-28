import { NextResponse } from "next/server";
import { inspectSignInCode, redeemSignInCode, signInCodeRateOk, SESSION_COOKIE, type SignInCodeFailure } from "@/lib/auth";
import { authError, isSameOriginWrite, readObject } from "@/lib/auth-http";
import { acceptedBand } from "@/lib/account-policy";

function failure(reason: SignInCodeFailure, attemptsLeft?: number) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (reason === "locked") {
    return NextResponse.json({ ok: false, reason, attemptsLeft: 0, error: "Too many incorrect codes. This code is cancelled — request a fresh sign-in email." }, { status: 400, headers });
  }
  if (reason === "expired") {
    return NextResponse.json({ ok: false, reason, error: "That code expired or was already used. Request a fresh sign-in email." }, { status: 410, headers });
  }
  return NextResponse.json({
    ok: false, reason, ...(attemptsLeft !== undefined ? { attemptsLeft } : {}),
    error: attemptsLeft !== undefined
      ? `That code doesn't match. ${attemptsLeft} ${attemptsLeft === 1 ? "try" : "tries"} left before this code is cancelled.`
      : "That code doesn't match. Check the code in your most recent sign-in email.",
  }, { status: 400, headers });
}

/** The 6-digit alternative to the emailed link: same row, same session, same consent rules. */
export async function POST(req: Request) {
  if (!isSameOriginWrite(req)) return authError("Enter the code from the sign-in page.", 403);
  const body = await readObject(req);
  const ip = process.env.VERCEL
    ? (req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim()
    : "local";
  try {
    const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
    if (!await signInCodeRateOk(body.email, ip)) return authError("Too many code attempts. Try again in 15 minutes.", 429);
    if (body.action === "inspect") {
      const info = await inspectSignInCode(body.email, body.code);
      return info.ok
        ? NextResponse.json({ ok: true, needsConsent: info.needsConsent, ageBand: info.ageBand, returnTo: info.returnTo }, { headers })
        : failure(info.reason, info.attemptsLeft);
    }
    if (body.action !== "confirm") return authError("Confirm sign-in to continue.", 400);
    const result = await redeemSignInCode(body.email, body.code, acceptedBand(body));
    if (!result.ok) {
      if (result.reason === "consent") {
        return authError("Confirm your current age group and community terms to finish signing in.", 409);
      }
      return failure(result.reason, result.attemptsLeft);
    }
    const res = NextResponse.json({ ok: true, returnTo: result.returnTo }, { headers });
    res.cookies.set(SESSION_COOKIE, result.sessionToken, {
      httpOnly: true, secure: !!process.env.VERCEL || new URL(req.headers.get("origin") || req.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch { return authError("Sign-in is temporarily unavailable. Please try again.", 503); }
}
