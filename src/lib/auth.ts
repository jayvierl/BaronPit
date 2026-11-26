import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { q, dbAvailable } from "./db";
import { sendMagicLinkEmail } from "./auth-email";

export const SESSION_COOKIE = "wp_session";
const LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface User {
  id: number;
  email: string;
  displayName: string;
  avatarHue: number;
  bio: string;
  createdAt: string;
  bannedUntil: string | null;
  strikeCount: number;
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function rowToUser(r: Record<string, unknown>): User {
  return {
    id: Number(r.id),
    email: String(r.email),
    displayName: String(r.display_name),
    avatarHue: Number(r.avatar_hue),
    bio: String(r.bio ?? ""),
    createdAt: String(r.created_at),
    bannedUntil: r.banned_until ? String(r.banned_until) : null,
    strikeCount: Number(r.strike_count ?? 0),
  };
}

export function isAdmin(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export type RequestLinkResult =
  | { ok: true }
  | { ok: false; error: "not_configured" | "unavailable" | "invalid_email" };

export async function requestMagicLink(emailRaw: string, origin: string): Promise<RequestLinkResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, error: "invalid_email" };
  }
  if (!dbAvailable()) return { ok: false, error: "unavailable" };
  const token = randomBytes(32).toString("hex");
  try {
    await q`INSERT INTO wp_magic_links (email, token_hash, expires_at)
            VALUES (${email}, ${hash(token)}, ${new Date(Date.now() + LINK_TTL_MS).toISOString()})`;
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const link = `${origin}/api/auth/verify?token=${token}`;
  const sent = await sendMagicLinkEmail(email, link);
  if (!sent.ok) {
    return { ok: false, error: sent.error === "not_configured" ? "not_configured" : "unavailable" };
  }
  return { ok: true };
}

export async function redeemMagicLink(token: string): Promise<{ user: User; sessionToken: string } | null> {
  if (!dbAvailable() || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await q`SELECT * FROM wp_magic_links
                       WHERE token_hash = ${hash(token)} AND used_at IS NULL AND expires_at > now()
                       LIMIT 1`;
  if (rows.length === 0) return null;
  const email = String(rows[0].email);
  const claimed = await q`UPDATE wp_magic_links SET used_at = now() WHERE id = ${Number(rows[0].id)} AND used_at IS NULL RETURNING id`;
  if (claimed.length === 0) return null;

  let users = await q`SELECT * FROM wp_users WHERE email = ${email} LIMIT 1`;
  if (users.length === 0) {
    const name = email.split("@")[0].replace(/[._-]+/g, " ").slice(0, 40) || "Player";
    const hue = Math.floor(Math.random() * 360);
    users = await q`INSERT INTO wp_users (email, display_name, avatar_hue)
                     VALUES (${email}, ${name}, ${hue}) RETURNING *`;
  }
  const user = rowToUser(users[0]);
  const sessionToken = randomBytes(32).toString("hex");
  await q`INSERT INTO wp_sessions (user_id, token_hash, expires_at)
          VALUES (${user.id}, ${hash(sessionToken)}, ${new Date(Date.now() + SESSION_TTL_MS).toISOString()})`;
  return { user, sessionToken };
}

export async function getCurrentUser(): Promise<User | null> {
  if (!dbAvailable()) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const rows = await q`SELECT u.* FROM wp_sessions s
                         JOIN wp_users u ON u.id = s.user_id
                         WHERE s.token_hash = ${hash(token)} AND s.expires_at > now()
                         LIMIT 1`;
    if (rows.length === 0) return null;
    // Throttled touch: at most one last_seen write per user per 5 minutes.
    await q`UPDATE wp_users SET last_seen_at = now() WHERE id = ${Number(rows[0].id)} AND last_seen_at < now() - interval '5 minutes'`;
    return rowToUser(rows[0]);
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && dbAvailable()) {
    await q`DELETE FROM wp_sessions WHERE token_hash = ${hash(token)}`.catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}

export function isBanned(user: User): boolean {
  return Boolean(user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now());
}

/** Simple DB-backed rate limit. Returns true when the action is allowed. */
export async function rateLimit(userId: number, action: string, max: number, windowMinutes: number): Promise<boolean> {
  const rows = await q`SELECT count(*)::int AS n FROM wp_rate_events
                       WHERE user_id = ${userId} AND action = ${action}
                         AND created_at > now() - make_interval(mins => ${windowMinutes})`;
  if (Number(rows[0]?.n ?? 0) >= max) return false;
  await q`INSERT INTO wp_rate_events (user_id, action) VALUES (${userId}, ${action})`;
  return true;
}
