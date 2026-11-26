import { createHash, randomBytes } from "node:crypto";
import { q, getSql } from "./db";

const digest = (state: string) => createHash("sha256").update(state).digest("hex");

export function riotSignOnConfig() {
  const clientId = process.env.RIOT_RSO_CLIENT_ID?.trim();
  const secret = process.env.RIOT_RSO_CLIENT_SECRET;
  const uri = process.env.RIOT_RSO_REDIRECT_URI;
  if (!clientId || !secret || !uri) return null;
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:" || uri !== url.origin + "/api/account/riot/callback") return null;
    return { clientId, secret, uri, origin: url.origin };
  } catch { return null; }
}

export async function beginOwnership(userId: number, puuid: string) {
  const state = randomBytes(32).toString("hex");
  const rows = await q`INSERT INTO wp_riot_authorizations(user_id,puuid,state_hash,expires_at)
    SELECT user_id,puuid,${digest(state)},now()+interval '10 minutes' FROM wp_links
    WHERE user_id=${userId} AND puuid=${puuid} AND NOT verified
    ON CONFLICT(user_id) DO UPDATE SET puuid=excluded.puuid,state_hash=excluded.state_hash,expires_at=excluded.expires_at
    RETURNING user_id`;
  return rows.length ? state : null;
}

export async function consumeOwnershipState(userId: number, state: string) {
  if (!/^[a-f0-9]{64}$/.test(state)) return null;
  const [row] = await q`DELETE FROM wp_riot_authorizations
    WHERE user_id=${userId} AND state_hash=${digest(state)} AND expires_at>now() RETURNING puuid`;
  return row ? String(row.puuid) : null;
}

export function authorizationUrl(config: NonNullable<ReturnType<typeof riotSignOnConfig>>, state: string) {
  const url = new URL("https://auth.riotgames.com/authorize");
  url.search = new URLSearchParams({client_id:config.clientId,redirect_uri:config.uri,response_type:"code",scope:"openid",state}).toString();
  return url;
}

// Riot authenticates the player. A lookup or an ID supplied by the browser cannot prove ownership.
export async function fetchOwnedRiotId(config: NonNullable<ReturnType<typeof riotSignOnConfig>>, code: string) {
  if (!code || code.length>4096) return null;
  const exchange = await fetch("https://auth.riotgames.com/token", {
    method:"POST", cache:"no-store", redirect:"error", signal:AbortSignal.timeout(8000),
    headers:{Authorization:"Basic "+Buffer.from(config.clientId+":"+config.secret).toString("base64"),
      "Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:config.uri}),
  });
  if (!exchange.ok) return null;
  const {access_token:token} = await exchange.json();
  if (typeof token!=="string" || !token) return null;
  const account = await fetch("https://americas.api.riotgames.com/riot/account/v1/accounts/me", {
    headers:{Authorization:"Bearer "+token},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000),
  });
  if (!account.ok) return null;
  const {puuid} = await account.json();
  return typeof puuid==="string" && puuid.length>0 && puuid.length<=128 ? puuid : null;
}

export async function verifyLinkedOwner(userId: number, claimed: string, proven: string | null) {
  if (!proven || proven !== claimed) return false;
  // Each verification of this identity takes the same lock. The next statement sees
  // the previous committer at READ COMMITTED, including a concurrent verification.
  const sql=await getSql();
  const [, rows]=await sql.transaction([
    sql`SELECT puuid FROM wp_players WHERE puuid=${proven} FOR UPDATE`,
    sql`UPDATE wp_links SET verified=true WHERE user_id=${userId} AND puuid=${proven}
      AND NOT EXISTS(SELECT 1 FROM wp_links other WHERE other.puuid=${proven} AND other.verified AND other.user_id<>${userId})
      AND EXISTS(SELECT 1 FROM wp_users WHERE id=${userId} AND safety_status='visible' AND (banned_until IS NULL OR banned_until<=now()))
      RETURNING user_id`,
  ]);
  return rows.length>0;
}

export const clearExpiredOwnership = () => q`DELETE FROM wp_riot_authorizations WHERE expires_at<=now()`;
