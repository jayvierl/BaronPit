import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin, isBanned, rateLimit, type User } from "./auth";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function configuredHttpsOrigin(origin: string): boolean {
  const configured = [process.env.APP_ORIGIN, process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL];
  return configured.some(value => {
    if (!value) return false;
    try {
      const url = new URL(value.includes("://") ? value : "https://" + value);
      return url.protocol === "https:" && url.origin === origin;
    } catch { return false; }
  });
}

// Next's standalone adapter can normalize the URL hostname to the listener's
// hostname (e.g. localhost), even when the browser requested 127.0.0.1.
// Compare the exact authority, including port, and never trust a forwarded host.
export function isSameOriginWrite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  const requestUrl = new URL(req.url);
  const host = req.headers.get("host");
  if (!host) return origin === requestUrl.origin;
  if (!/^[a-zA-Z0-9.:[\]-]+$/.test(host)) return false;
  try {
    const browser = new URL(origin);
    if (!["https:","http:"].includes(browser.protocol) || browser.origin !== origin) return false;
    const authority = new URL(browser.protocol + "//" + host).origin;
    if (origin !== authority) return false;
    return browser.protocol === requestUrl.protocol || configuredHttpsOrigin(origin);
  } catch { return false; }
}

export function emailOrigin(req: Request): string | null {
  if (!isSameOriginWrite(req)) return null;
  const url = new URL(req.headers.get("origin") || req.url);
  if (configuredHttpsOrigin(url.origin)) return url.origin;
  if (!process.env.VERCEL && LOCAL_HOSTS.has(url.hostname)) return url.origin;
  return null;
}

export function authError(error: string, status: number) {
  return NextResponse.json({ ok: false, error, message: error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

type Access = { ok: true; user: User } | { ok: false; response: NextResponse };
export async function requireUser(req: Request, mode: "participate" | "protect" | "staff" = "participate"): Promise<Access> {
  if (!isSameOriginWrite(req)) return { ok: false, response: authError("Please submit this action from the app.",403) };
  let user: User | null;
  try { user = await getCurrentUser(); }
  catch { return {ok:false,response:authError("We couldn’t check your session. Please try again.",503)}; }
  if (!user) return { ok: false, response: authError("Sign in first.",401) };
  if (mode !== "protect" && isBanned(user)) {
    return { ok: false, response: authError("Your account is temporarily restricted. You can still report, block or appeal.",403) };
  }
  if (mode === "staff" && !isAdmin(user.email)) return { ok: false, response: authError("Not allowed.",403) };
  if (mode === "participate" && process.env.SAFETY_PAUSE_PUBLICATION === "true") return {ok:false,response:authError("New participation is paused while the safety team responds. Reports, blocks and appeals remain open.",503)};
  if (mode === "participate" && !user.termsCurrent) {
    return { ok: false, response: NextResponse.json({ok:false, error:"Confirm your age group and accept the current terms in your account to participate.", href:"/signin?enrol=1"}, {status:403}) };
  }
  // Bound bursty writes across devices while preserving independent safety/report quotas.
  if (mode === "participate") {
    try {
      const allowed = await rateLimit(user.id, "community-write", 100, 5);
      if (!allowed) return { ok:false, response:authError("Too many changes. Please try again in five minutes.",429) };
    } catch { return {ok:false,response:authError("Community actions are temporarily unavailable.",503)}; }
  }
  return { ok: true, user };
}

export async function readObject(req: Request): Promise<Record<string, unknown>> {
  const value: unknown = await req.json().catch(() => null);
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
