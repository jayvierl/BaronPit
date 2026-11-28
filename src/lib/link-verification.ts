import { randomInt } from "node:crypto";
import { q } from "./db";
import { fetchCurrentProfileIcon } from "./riot";
import { verifyLinkedOwner } from "./riot-ownership";

/**
 * Icon-ownership verification for claimed Riot links.
 *
 * A claim (wp_links.verified = false) becomes verified when the user proves
 * control of the League account: we assign a profile icon, they set it in the
 * client, and a fresh summoner read must show exactly that icon. The verified
 * flag earned here is the same one Riot Sign On grants — the surfaces that
 * trust `verified` cannot tell the paths apart.
 *
 * The assignable set is Data Dragon's original base icon range, IDs 0–28:
 * the default summoner icons granted to every League account at creation.
 * Event, store and reward icons are never assigned, because not every
 * account owns them.
 */
export const VERIFICATION_ICON_IDS: readonly number[] = Array.from({ length: 29 }, (_, i) => i);

export const LINK_VERIFICATION_TTL_MS = 30 * 60 * 1000;

export function pickVerificationIcon(currentIcon: number, roll: (max: number) => number = (max) => randomInt(max)): number {
  const choices = VERIFICATION_ICON_IDS.filter((id) => id !== currentIcon);
  return choices[Math.min(choices.length - 1, Math.max(0, roll(choices.length)))];
}

export type StartVerification =
  | { ok: true; iconId: number; currentIcon: number; expiresAt: string }
  | { ok: false; code: "not_linked" | "already_verified" | "not_found" | "key_unavailable" | "rate_limited" | "lookup_failed" };

export type CheckVerification =
  | { ok: true }
  | { ok: false; code: "not_linked" | "already_verified" | "not_started" | "expired" | "mismatch" | "conflict" | "not_found" | "key_unavailable" | "rate_limited" | "lookup_failed" };

function lookupFailure(status: number): "not_found" | "key_unavailable" | "rate_limited" | "lookup_failed" {
  if (status === 404) return "not_found";
  if (status === 401 || status === 403 || status === 503) return "key_unavailable";
  if (status === 429) return "rate_limited";
  return "lookup_failed";
}

async function linkedPlayer(userId: number, puuid: string) {
  const [row] = await q`SELECT l.verified, p.platform FROM wp_links l JOIN wp_players p ON p.puuid = l.puuid
    WHERE l.user_id = ${userId} AND l.puuid = ${puuid}`;
  return row ? { verified: row.verified === true, platform: String(row.platform) } : null;
}

export async function startLinkVerification(userId: number, puuid: string): Promise<StartVerification> {
  const link = await linkedPlayer(userId, puuid);
  if (!link) return { ok: false, code: "not_linked" };
  if (link.verified) return { ok: false, code: "already_verified" };
  // The assignment must never equal the icon the account already shows, so the
  // current icon is read fresh first; a failed read starts nothing.
  const current = await fetchCurrentProfileIcon(link.platform, puuid);
  if (current.status !== 200 || current.icon === null) return { ok: false, code: lookupFailure(current.status) };
  const iconId = pickVerificationIcon(current.icon);
  const expiresAt = new Date(Date.now() + LINK_VERIFICATION_TTL_MS).toISOString();
  await q`INSERT INTO wp_link_verifications (user_id, puuid, icon_id, expires_at)
    VALUES (${userId}, ${puuid}, ${iconId}, ${expiresAt})
    ON CONFLICT (user_id, puuid) DO UPDATE SET icon_id = excluded.icon_id, expires_at = excluded.expires_at, created_at = now()`;
  return { ok: true, iconId, currentIcon: current.icon, expiresAt };
}

export async function pendingLinkVerification(userId: number, puuid: string) {
  const [row] = await q`SELECT icon_id, expires_at FROM wp_link_verifications
    WHERE user_id = ${userId} AND puuid = ${puuid} AND expires_at > now()`;
  return row ? { iconId: Number(row.icon_id), expiresAt: String(row.expires_at) } : null;
}

export async function checkLinkVerification(userId: number, puuid: string): Promise<CheckVerification> {
  const link = await linkedPlayer(userId, puuid);
  if (!link) return { ok: false, code: "not_linked" };
  if (link.verified) return { ok: false, code: "already_verified" };
  const [pending] = await q`SELECT icon_id, expires_at FROM wp_link_verifications
    WHERE user_id = ${userId} AND puuid = ${puuid}`;
  if (!pending) return { ok: false, code: "not_started" };
  if (new Date(String(pending.expires_at)).getTime() <= Date.now()) {
    await q`DELETE FROM wp_link_verifications WHERE user_id = ${userId} AND puuid = ${puuid}`;
    return { ok: false, code: "expired" };
  }
  const current = await fetchCurrentProfileIcon(link.platform, puuid);
  if (current.status !== 200 || current.icon === null) return { ok: false, code: lookupFailure(current.status) };
  if (current.icon !== Number(pending.icon_id)) return { ok: false, code: "mismatch" };
  // The icon read is the proof of control for this puuid; the shared guard
  // applies the same one-verified-owner and account-standing rules as RSO.
  const verified = await verifyLinkedOwner(userId, puuid, puuid);
  if (!verified) return { ok: false, code: "conflict" };
  await q`DELETE FROM wp_link_verifications WHERE user_id = ${userId} AND puuid = ${puuid}`;
  return { ok: true };
}

export const clearExpiredLinkVerifications = () => q`DELETE FROM wp_link_verifications WHERE expires_at <= now()`;
