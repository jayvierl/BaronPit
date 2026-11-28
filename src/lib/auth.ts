import { consumeWindow } from "./rate-window";
import { publicAvatar, type AvatarRef } from "./avatar";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { TERMS_VERSION, isAgeBand, type AgeBand } from "./account-policy";
import { safeReturnTo } from "./signin-return";
import { cookies } from "next/headers";
import { q, dbAvailable } from "./db";
import { sendMagicLinkEmail } from "./auth-email";

export const SESSION_COOKIE = "wp_session";
const LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Wrong-code submissions allowed before the sign-in row (link + code) is cancelled. */
export const SIGN_IN_CODE_MAX_ATTEMPTS = 5;

/** Zero-padded 6-digit rendering of a sign-in code value (0–999999). */
export function formatSignInCode(value: number): string {
  return String(Math.max(0, Math.min(999999, Math.trunc(value)))).padStart(6, "0");
}

function signInCodeHash(email: string, code: string): string {
  return hash(`signin-code:${email}:${code}`);
}

export interface User {
  id: number;
  email: string;
  displayName: string;
  avatarHue: number;
  avatar?: AvatarRef;
  profileVersion?: number;
  profileLink?: string | null;
  bio: string;
  createdAt: string;
  bannedUntil: string | null;
  safetyStatus?: string;
  strikeCount: number;
  ageBand: AgeBand | null;
  termsCurrent: boolean;
  pilotActive?: boolean;
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hasCurrentConsent(row: Record<string, unknown>): boolean {
  return isAgeBand(row.age_band) && row.terms_version === TERMS_VERSION && row.terms_accepted_at != null;
}

function rowToUser(r: Record<string, unknown>): User {
  return {
    id: Number(r.id),
    email: String(r.email),
    displayName: String(r.display_name),
    avatarHue: Number(r.avatar_hue),
    avatar: publicAvatar(r.avatar_ref),
    profileVersion: Number(r.profile_version ?? 0),
    profileLink: typeof r.profile_link === "string" ? r.profile_link : null,
    bio: String(r.bio ?? ""),
    createdAt: String(r.created_at),
    bannedUntil: r.banned_until ? String(r.banned_until) : null,
    safetyStatus: typeof r.safety_status === "string" ? r.safety_status : "visible",
    strikeCount: Number(r.strike_count ?? 0),
    pilotActive: r.pilot_active === true,
    ageBand: isAgeBand(r.age_band) ? r.age_band : null,
    termsCurrent: hasCurrentConsent(r),
  };
}

export function isAdmin(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

type LinkError = "not_configured" | "unavailable" | "invalid_email" | "rate_limited";
export type RequestLinkResult = { ok: true } | { ok: false; error: LinkError };
const validToken = (token: unknown): token is string => typeof token === "string" && /^[a-f0-9]{64}$/.test(token);

export async function requestMagicLink(emailRaw: string, origin: string, clientIp: string, signup: boolean, destination?: unknown): Promise<RequestLinkResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: "invalid_email" };
  if (!dbAvailable()) return { ok: false, error: "unavailable" };
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "not_configured" };
  const digest = (s: string) => createHmac("sha256", process.env.AUTH_RATE_KEY || process.env.RESEND_API_KEY!).update(s).digest("hex");
  const token = randomBytes(32).toString("hex");
  // The code is independent random material — never derived from the token —
  // and only its hash is stored, on the same row, so either path consumes both.
  const code = formatSignInCode(randomInt(0, 1_000_000));
  try {
    if (!await consumeWindow("email-ip:" + digest(clientIp), 20, 15)) return { ok: false, error: "rate_limited" };
    if (!await consumeWindow("email:" + digest(email), 3, 15)) return { ok: true };
    // The response for a sign-in request stays the same for unknown addresses.
    const issued = await q`INSERT INTO wp_magic_links (email,token_hash,code_hash,expires_at,may_create,return_to)
      SELECT ${email},${hash(token)},${signInCodeHash(email, code)},${new Date(Date.now() + LINK_TTL_MS).toISOString()},${signup},${safeReturnTo(destination)}
      WHERE ${signup} OR EXISTS (SELECT 1 FROM wp_users WHERE email=${email}) RETURNING id`;
    if (!issued.length) return { ok: true };
    const sent = await sendMagicLinkEmail(email, origin + "/signin/confirm#" + token, signup, code);
    if (!sent.ok) {
      await q`DELETE FROM wp_magic_links WHERE token_hash=${hash(token)}`;
      return { ok: false, error: sent.error === "not_configured" ? "not_configured" : "unavailable" };
    }
    return { ok: true };
  } catch { return { ok: false, error: "unavailable" }; }
}

async function inspectLinkHash(tokenHash: string) {
  if (!dbAvailable()) throw new Error("Sign-in storage is unavailable");
  const [row] = await q`SELECT l.return_to,u.age_band,u.terms_version,u.terms_accepted_at FROM wp_magic_links l LEFT JOIN wp_users u ON u.email=l.email
    WHERE l.token_hash=${tokenHash} AND l.used_at IS NULL AND l.expires_at>now() AND (l.may_create OR u.id IS NOT NULL)`;
  return row ? { needsConsent: !hasCurrentConsent(row),
    ageBand: isAgeBand(row.age_band) ? row.age_band : null, returnTo: safeReturnTo(row.return_to) } : null;
}

export async function inspectMagicLink(token: unknown) {
  if (!validToken(token)) return null;
  return inspectLinkHash(hash(token));
}

async function redeemLinkHash(tokenHash: string, band: AgeBand | null): Promise<{ user: User; sessionToken: string; returnTo: string } | null> {
  if (!dbAvailable()) throw new Error("Sign-in storage is unavailable");
  const sessionToken = randomBytes(32).toString("hex");
  const name = "Player " + randomBytes(4).toString("hex");
  const rows = await q`WITH consumed AS (
    UPDATE wp_magic_links l SET used_at=now()
    WHERE token_hash=${tokenHash} AND used_at IS NULL AND expires_at>now()
      AND (l.may_create OR EXISTS(SELECT 1 FROM wp_users u WHERE u.email=l.email))
      AND (${band}::text IS NOT NULL OR EXISTS(SELECT 1 FROM wp_users u WHERE u.email=l.email
        AND u.age_band IN ('teen','adult') AND u.terms_version=${TERMS_VERSION} AND u.terms_accepted_at IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM wp_users u WHERE u.email=l.email AND u.age_band IS NOT NULL AND u.age_band<>${band})
    RETURNING email, return_to
  ), account AS (
    INSERT INTO wp_users(email,display_name,avatar_hue,age_band,terms_version,terms_accepted_at)
    SELECT email,${name},${randomInt(360)},${band},${TERMS_VERSION},now() FROM consumed
    ON CONFLICT(email) DO UPDATE SET age_band=coalesce(wp_users.age_band,excluded.age_band),terms_version=excluded.terms_version,
      terms_accepted_at=CASE WHEN wp_users.terms_version IS DISTINCT FROM excluded.terms_version THEN excluded.terms_accepted_at
        ELSE coalesce(wp_users.terms_accepted_at,excluded.terms_accepted_at) END
    WHERE (wp_users.age_band IS NULL OR excluded.age_band IS NULL OR wp_users.age_band=excluded.age_band)
    RETURNING *
  ), session AS (
    INSERT INTO wp_sessions(user_id,token_hash,expires_at) SELECT id,${hash(sessionToken)},${new Date(Date.now()+SESSION_TTL_MS).toISOString()}
    FROM account RETURNING user_id
  ) SELECT account.*, consumed.return_to FROM account JOIN session ON session.user_id=account.id JOIN consumed ON consumed.email=account.email`;
  return rows.length ? { user: rowToUser(rows[0]), sessionToken, returnTo: safeReturnTo(rows[0].return_to) } : null;
}

export async function redeemMagicLink(token: unknown, band: AgeBand | null): Promise<{ user: User; sessionToken: string; returnTo: string } | null> {
  if (!validToken(token)) return null;
  return redeemLinkHash(hash(token), band);
}

export type SignInCodeFailure = "invalid" | "locked" | "expired";
export type SignInCodeCheck =
  | { ok: true; tokenHash: string }
  | { ok: false; reason: SignInCodeFailure; attemptsLeft?: number };

const normalizeEmail = (value: unknown): string => typeof value === "string" ? value.trim().toLowerCase() : "";

/** Pre-auth rate limit for code verification, on the shared window store. */
export async function signInCodeRateOk(emailRaw: unknown, clientIp: string): Promise<boolean> {
  const email = normalizeEmail(emailRaw);
  const digest = (s: string) => createHmac("sha256", process.env.AUTH_RATE_KEY || process.env.RESEND_API_KEY || "baron-signin-code").update(s).digest("hex");
  if (!await consumeWindow("code-ip:" + digest(clientIp), 100, 15)) return false;
  if (email && !await consumeWindow("code-email:" + digest(email), 40, 15)) return false;
  return true;
}

/**
 * Validate a 6-digit sign-in code against the newest outstanding row for the
 * email. A match does not consume the row (redemption does); a miss is counted
 * atomically, and the miss that reaches the cap cancels the row outright, so
 * the link in the same email dies with the code.
 */
export async function checkSignInCode(emailRaw: unknown, codeRaw: unknown): Promise<SignInCodeCheck> {
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof codeRaw !== "string" || !/^\d{6}$/.test(codeRaw)) {
    return { ok: false, reason: "invalid" };
  }
  if (!dbAvailable()) throw new Error("Sign-in storage is unavailable");
  const [row] = await q`SELECT id, token_hash, code_hash, code_attempts FROM wp_magic_links
    WHERE email=${email} AND used_at IS NULL AND expires_at>now() AND code_hash IS NOT NULL
    ORDER BY id DESC LIMIT 1`;
  if (!row) return { ok: false, reason: "expired" };
  const expected = Buffer.from(String(row.code_hash), "hex");
  const actual = Buffer.from(signInCodeHash(email, codeRaw), "hex");
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
    return { ok: true, tokenHash: String(row.token_hash) };
  }
  const [bumped] = await q`UPDATE wp_magic_links SET code_attempts=code_attempts+1
    WHERE id=${row.id} AND used_at IS NULL AND expires_at>now() RETURNING code_attempts`;
  if (!bumped) return { ok: false, reason: "expired" };
  const attempts = Number(bumped.code_attempts);
  if (attempts >= SIGN_IN_CODE_MAX_ATTEMPTS) {
    await q`UPDATE wp_magic_links SET used_at=now() WHERE id=${row.id} AND used_at IS NULL`;
    return { ok: false, reason: "locked", attemptsLeft: 0 };
  }
  return { ok: false, reason: "invalid", attemptsLeft: SIGN_IN_CODE_MAX_ATTEMPTS - attempts };
}

export type SignInCodeInspect =
  | { ok: true; needsConsent: boolean; ageBand: AgeBand | null; returnTo: string }
  | { ok: false; reason: SignInCodeFailure; attemptsLeft?: number };

export async function inspectSignInCode(emailRaw: unknown, codeRaw: unknown): Promise<SignInCodeInspect> {
  const check = await checkSignInCode(emailRaw, codeRaw);
  if (!check.ok) return check;
  const info = await inspectLinkHash(check.tokenHash);
  return info ? { ok: true, ...info } : { ok: false, reason: "expired" };
}

export type SignInCodeRedeem =
  | { ok: true; user: User; sessionToken: string; returnTo: string }
  | { ok: false; reason: SignInCodeFailure | "consent"; attemptsLeft?: number };

export async function redeemSignInCode(emailRaw: unknown, codeRaw: unknown, band: AgeBand | null): Promise<SignInCodeRedeem> {
  const check = await checkSignInCode(emailRaw, codeRaw);
  if (!check.ok) return check;
  const result = await redeemLinkHash(check.tokenHash, band);
  if (result) return { ok: true, ...result };
  const info = await inspectLinkHash(check.tokenHash);
  return info ? { ok: false, reason: "consent" } : { ok: false, reason: "expired" };
}

export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!validToken(token)) return null;
  if (!dbAvailable()) throw new Error("Session storage is unavailable");
  const [row] = await q`SELECT u.*,EXISTS(SELECT 1 FROM wp_pilot_members m WHERE m.user_id=u.id
        AND m.joined_at>now()-interval '28 days') AS pilot_active
    FROM wp_sessions s JOIN wp_users u ON u.id=s.user_id
    WHERE s.token_hash=${hash(token)} AND s.expires_at>now() LIMIT 1`;
  if (!row) return null;
  if (Date.now() - new Date(String(row.last_seen_at)).getTime() > 300_000) {
    // The activity watermark is optional. Its failure must not invalidate a verified session.
    await q`UPDATE wp_users SET last_seen_at=now() WHERE id=${row.id} AND last_seen_at<now()-interval '5 minutes'`.catch(()=>{});
  }
  return rowToUser(row);
});

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (validToken(token)) {
    await q`DELETE FROM wp_sessions WHERE token_hash = ${hash(token)}`;
  }
  store.delete(SESSION_COOKIE);
}

export function isBanned(user: User): boolean {
  return (user.safetyStatus !== undefined && user.safetyStatus !== "visible") ||
    Boolean(user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now());
}

// ON CONFLICT serializes attempts on the same bucket, including across function instances.
export function rateLimit(userId: number, action: string, max: number, windowMinutes: number): Promise<boolean> {
  return consumeWindow("user:" + userId + ":" + action, max, windowMinutes);
}

export async function clearExpiredAuthData() {
  await Promise.all([q`DELETE FROM wp_action_windows WHERE expires_at<now()`,q`DELETE FROM wp_magic_links WHERE expires_at<now()`,q`DELETE FROM wp_sessions WHERE expires_at<now()`,q`DELETE FROM wp_rate_events WHERE created_at<now()-interval '1 day'`,q`DELETE FROM wp_link_verifications WHERE expires_at<now()`]);
}
