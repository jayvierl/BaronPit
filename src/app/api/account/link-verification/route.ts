import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { rateLimit } from "@/lib/auth";
import { checkLinkVerification, startLinkVerification } from "@/lib/link-verification";
import { currentPatch, profileIconUrl } from "@/lib/riot";

const MESSAGES: Record<string, { status: number; error: string }> = {
  not_linked: { status: 404, error: "That Riot ID isn't linked to your account." },
  already_verified: { status: 409, error: "This link is already verified." },
  not_started: { status: 409, error: "Start verification first, then check once you've changed your icon." },
  expired: { status: 410, error: "That verification expired. Start again for a fresh icon." },
  not_found: { status: 400, error: "That Riot account wasn't found. It may have been renamed or removed." },
  key_unavailable: { status: 503, error: "Player lookup is briefly unavailable (API key rotation). Try again in a moment." },
  rate_limited: { status: 429, error: "Riot is rate-limiting lookups right now. Try again in a moment." },
  lookup_failed: { status: 503, error: "Player lookup failed — try again in a moment." },
  conflict: { status: 409, error: "This Riot account is already verified by another Baron Pit account." },
};

function failure(code: string) {
  const message = MESSAGES[code] ?? MESSAGES.lookup_failed;
  return NextResponse.json({ ok: false, code, error: message.error }, { status: message.status });
}

/** Icon-ownership verification for a claimed Riot link. Owner-only, per-link. */
export async function POST(req: Request) {
  const access = await requireUser(req, "protect");
  if (!access.ok) return access.response;
  const { user } = access;
  const body = (await readObject(req)) as { action?: string; puuid?: string };
  const { action, puuid } = body;
  if (typeof puuid !== "string" || !puuid || puuid.length > 128 || (action !== "start" && action !== "check")) {
    return NextResponse.json({ ok: false, error: "Bad verification request." }, { status: 400 });
  }
  if (action === "start") {
    if (!await rateLimit(user.id, "riot-verify-start", 6, 15)) {
      return NextResponse.json({ ok: false, error: "Too many verification starts. Try again in 15 minutes." }, { status: 429 });
    }
    const result = await startLinkVerification(user.id, puuid);
    if (!result.ok) return failure(result.code);
    return NextResponse.json({
      ok: true, iconId: result.iconId, iconUrl: profileIconUrl(await currentPatch(), result.iconId),
      currentIcon: result.currentIcon, expiresAt: result.expiresAt,
    });
  }
  if (!await rateLimit(user.id, "riot-verify-check", 12, 15)) {
    return NextResponse.json({ ok: false, error: "Too many verification checks. Try again in 15 minutes." }, { status: 429 });
  }
  const result = await checkLinkVerification(user.id, puuid);
  if (!result.ok) {
    if (result.code === "mismatch") {
      return NextResponse.json({
        ok: false, code: "mismatch",
        error: "Your League profile icon doesn't match the assigned one yet. Set it in the client, wait a minute, then check again.",
      }, { status: 200 });
    }
    return failure(result.code);
  }
  return NextResponse.json({ ok: true, verified: true });
}
