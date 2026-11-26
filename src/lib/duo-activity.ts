import { TERMS_VERSION } from "./account-policy";
import { queryRows } from "./db";
import { duoActivityPairsCte, duoEnabled, duoPairsCte } from "./duo";

export interface DuoActivityItem {
  id: number;
  incoming: boolean;
  state: "pending" | "accepted" | "expired" | "cancelled";
  listingEnded: boolean;
  expiresAt: string;
  canCancel?: true;
}

export async function hasIncomingDuoRequest(userId: number): Promise<boolean> {
  if (!duoEnabled()) return false;
  const rows = await queryRows(
    duoPairsCte +
      `
    SELECT 1 FROM pairs WHERE status='pending' AND sender_id<>$1 AND (session_start IS NULL OR session_start>now()) LIMIT 1`,
    [userId, TERMS_VERSION],
  );
  return rows.length > 0;
}

/** Derive notices from the current relationship. No copied identities, notification records, or extended retention. */
export async function privateDuoActivity(userId: number): Promise<DuoActivityItem[]> {
  if (!duoEnabled()) return [];
  const rows = await queryRows(
    duoActivityPairsCte +
      `
    SELECT p.id,p.sender_id<>$1 AS incoming,p.can_cancel,
      CASE WHEN p.status='pending' THEN coalesce(p.session_start,p.expires_at) ELSE p.expires_at END AS expires_at,
      p.cancelled_at IS NOT NULL OR (p.status='pending' AND coalesce(p.session_start,p.expires_at)<=now()) OR p.expires_at<=now() OR l.status='closed' AS listing_ended,
      CASE WHEN p.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN p.status='pending' AND coalesce(p.session_start,p.expires_at)<=now() THEN 'expired' ELSE p.status END AS state
    FROM pairs p JOIN wp_lfg l ON l.id=p.listing_id WHERE p.expires_at>now()-interval '24 hours'
    ORDER BY (p.status='pending' AND p.sender_id<>$1 AND coalesce(p.session_start,p.expires_at)>now()) DESC,
      CASE WHEN p.status='pending' AND coalesce(p.session_start,p.expires_at)<=now() THEN p.expires_at
        ELSE coalesce(p.cancelled_at,p.accepted_at,p.created_at) END DESC,p.id DESC LIMIT 30`,
    [userId, TERMS_VERSION],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    incoming: row.incoming === true,
    state: row.state as DuoActivityItem["state"],
    listingEnded: row.listing_ended === true,
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    ...(row.can_cancel === true ? { canCancel: true as const } : {}),
  }));
}
