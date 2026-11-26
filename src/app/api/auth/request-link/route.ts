import { NextResponse } from "next/server";
import { requestMagicLink } from "@/lib/auth";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const base = origin ?? `${proto}://${host}`;
  const result = await requestMagicLink(email, base);
  if (!result.ok) {
    const message =
      result.error === "not_configured" ? "Email sign-in isn't switched on yet."
      : result.error === "invalid_email" ? "That email doesn't look right."
      : "Sign-in is unavailable right now. Try again in a moment.";
    return NextResponse.json({ ok: false, error: result.error, message }, { status: result.error === "invalid_email" ? 400 : 503 });
  }
  return NextResponse.json({ ok: true });
}
