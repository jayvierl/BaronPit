import { NextResponse } from "next/server";
import { redeemMagicLink, SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const result = await redeemMagicLink(token).catch(() => null);
  if (!result) {
    return NextResponse.redirect(new URL("/signin?error=expired", url.origin));
  }
  const res = NextResponse.redirect(new URL("/me?welcome=1", url.origin));
  res.cookies.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
