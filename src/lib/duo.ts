import { sharedGame } from "./verified-duo-game";
import { getSql, q, queryRows } from "./db";
import { decodeWindows, encodeWindows, scheduleWindows, type PlayWindow } from "./duo-schedule";
import { filterByDuoFit, loadDuoFit } from "./duo-fit-store";
import { TERMS_VERSION } from "./account-policy";
import { rankLabel } from "./rank";
import { rateLimit, type User } from "./auth";
import { duoPreferences } from "./duo-input";
import { screenText } from "./managed-text-screen";

export const duoEnabled = () => process.env.DUO_MATCHING_ENABLED === "true";
type Row = Record<string, unknown>;
const missing = { ok: false as const, error: "That listing or request is no longer available." };
export interface DuoListing {
  id: number;
  roles: string[];
  champs: string[];
  blocks: string[];
  playWindows: PlayWindow[];
  partnerRole: string | null;
  voice: boolean;
  vibe: string;
  note: string;
  rank: string;
  form: string;
  expiresAt: string;
  platform: string;
  own: boolean;
  requested: boolean;
  held: boolean;
}
export interface DuoRequest {
  id: number;
  incoming: boolean;
  status: string;
  rank: string;
  riotId: string | null;
  platform: string;
  requeue: "available" | "waiting" | "mutual" | null;
  matchedAt: string | null;
  thanks: { sent: boolean; received: boolean; canSend: boolean; adultPair: boolean } | null;
}

// $1 is always the requesting user and $2 the current terms revision. Both participants are
// rechecked at read/accept time. Unlinking Riot, changing bands or blocking withdraws access.
const eligible = `WITH eligible AS NOT MATERIALIZED (
  SELECT u.id,u.age_band,p.puuid,p.platform,p.game_name,p.tag_line,p.rank_tier,p.rank_div,p.rank_lp,p.snapshot
  FROM wp_users u JOIN wp_links k ON k.user_id=u.id AND k.verified
  JOIN wp_players p ON p.puuid=k.puuid
  WHERE u.terms_version=$2 AND u.safety_status='visible' AND u.age_band IN ('adult','teen') AND u.terms_accepted_at IS NOT NULL
    AND u.created_at<=now()-interval '24 hours' AND (u.banned_until IS NULL OR u.banned_until<=now())
    AND NOT EXISTS(SELECT 1 FROM wp_links contested WHERE contested.puuid=k.puuid AND contested.verified AND contested.user_id<>k.user_id)
    AND p.rank_tier IS NOT NULL AND p.fetched_at>now()-interval '24 hours'
    AND jsonb_typeof(p.snapshot->'matches')='array' AND p.snapshot->'matches'->0 IS NOT NULL
), me AS (SELECT e.* FROM eligible e WHERE e.id=$1 ORDER BY e.puuid LIMIT 1)`;
const board = `${eligible}, board AS (
  SELECT l.*,peer.platform,peer.rank_tier,peer.rank_div,peer.rank_lp,
    peer.snapshot->>'wins' AS wins,peer.snapshot->>'games' AS games
  FROM me JOIN eligible peer ON peer.age_band=me.age_band AND peer.platform=me.platform
  JOIN wp_lfg l ON l.puuid=peer.puuid AND l.user_id=peer.id
  WHERE l.safe_listing AND l.expires_at>now()
    AND (l.status='open' OR (l.status='held' AND l.user_id=me.id))
    AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN ((me.id,peer.id),(peer.id,me.id)))
    AND NOT EXISTS(SELECT 1 FROM wp_mutes m WHERE (m.muter_id,m.muted_id) IN ((me.id,peer.id),(peer.id,me.id)))
)`;
const ownRequeue = `CASE WHEN r.sender_id=$1 THEN r.sender_requeue ELSE r.owner_requeue END`;
function pairScope(recentlyExpired = false) {
  return `${eligible}, pairs AS (
  SELECT r.id,r.status,r.sender_id,l.user_id AS owner_id,r.listing_id,r.created_at,r.accepted_at,l.expires_at,
    ${ownRequeue} AS my_choice,
    game.played AND NOT EXISTS (SELECT 1 FROM wp_reports f WHERE f.status='open'
      AND ((f.target_kind='duo_request' AND f.target_id=r.id) OR (f.target_kind='lfg' AND f.target_id=l.id))) AS can_thank,
    CASE WHEN r.sender_id=$1 THEN r.sender_thanked ELSE r.owner_thanked END AS sent_thanks,
    CASE WHEN r.sender_id=$1 THEN r.owner_thanked ELSE r.sender_thanked END AS received_thanks,
    sender.age_band='adult' AND owner.age_band='adult' AS adult_pair,
    r.sender_requeue AND r.owner_requeue AS mutual,
    r.status='accepted' AND (game.played OR ${ownRequeue}) AS can_requeue,
    CASE WHEN r.sender_id=$1 THEN owner.rank_tier ELSE sender.rank_tier END AS rank_tier,
    CASE WHEN r.sender_id=$1 THEN owner.rank_div ELSE sender.rank_div END AS rank_div,
    CASE WHEN r.status='accepted' AND ((l.expires_at>now() AND l.status='open') OR (r.sender_requeue AND r.owner_requeue)) THEN
      CASE WHEN r.sender_id=$1 THEN owner.game_name||'#'||owner.tag_line ELSE sender.game_name||'#'||sender.tag_line END
    END AS contact,owner.platform
  FROM wp_duo_requests r JOIN wp_lfg l ON l.id=r.listing_id
  JOIN eligible owner ON owner.id=l.user_id AND owner.puuid=l.puuid
  JOIN eligible sender ON sender.id=r.sender_id AND sender.puuid=r.sender_puuid
  CROSS JOIN LATERAL (SELECT CASE WHEN r.status='accepted' AND r.accepted_at IS NOT NULL THEN ${sharedGame}
    ELSE false END AS played) game
  WHERE $1 IN (l.user_id,r.sender_id) AND l.safe_listing
    AND ((l.status='open' AND l.expires_at>now())
      ${recentlyExpired ? "OR (l.status='open' AND l.expires_at<=now() AND l.expires_at>now()-interval '24 hours')" : ""} OR
      (l.status IN ('open','closed') AND r.status='accepted' AND r.accepted_at>now()-interval '30 days'
       AND (game.played OR ${ownRequeue} OR r.sender_thanked OR r.owner_thanked)))
    AND owner.age_band=sender.age_band AND owner.platform=sender.platform AND r.status IN ('pending','accepted')
    AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN ((l.user_id,r.sender_id),(r.sender_id,l.user_id)))
    AND NOT EXISTS(SELECT 1 FROM wp_mutes m WHERE (m.muter_id,m.muted_id) IN ((l.user_id,r.sender_id),(r.sender_id,l.user_id)))
)`;
}
const pairs = pairScope();
const params = (id: number) => [id, TERMS_VERSION];
export { eligible as duoEligibilityCte, pairs as duoPairsCte };
// Only the private Activity reader may broaden the listing time window; no actions use this scope.
export const duoActivityPairsCte = pairScope(true);
export async function duoEligible(userId: number) {
  if (!duoEnabled()) return false;
  return (await queryRows(eligible + " SELECT 1 FROM me", params(userId))).length > 0;
}
function listing(row: Row, userId: number): DuoListing {
  const wins = Number(row.wins),
    games = Number(row.games);
  return {
    id: Number(row.id),
    roles: row.roles as string[],
    champs: row.champs as string[],
    blocks: row.blocks as string[],
    playWindows: decodeWindows(row.play_windows),
    partnerRole: typeof row.partner_role === "string" ? row.partner_role : null,
    voice: row.voice === true,
    vibe: String(row.vibe),
    note: String(row.note),
    platform: String(row.platform).toUpperCase(),
    rank: rankLabel(String(row.rank_tier), row.rank_div as string | null),
    form: `${wins}W · ${Math.max(0, games - wins)}L in ${games} games`,
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    own: Number(row.user_id) === userId,
    requested: row.requested === true,
    held: row.status === "held",
  };
}
export async function readDuoBoard(userId: number, onlyFit = false, asOf = Date.now()) {
  if (!duoEnabled()) return { listings: [], requests: [] };
  const [rows, requests] = await Promise.all([
    (async () => {
      const fit = onlyFit ? await loadDuoFit(userId) : null;
      const windows = fit?.blocks.length ? encodeWindows(scheduleWindows(fit.blocks, fit.timeZone, asOf)) : null;
      return queryRows(
        board +
          ` SELECT b.id,b.user_id,b.roles,b.champs,b.blocks,b.play_windows::text AS play_windows,b.partner_role,b.voice,b.vibe,b.note,b.rank_tier,b.rank_div,b.wins,b.games,b.platform,b.expires_at,b.status,
        EXISTS(SELECT 1 FROM wp_duo_requests r WHERE r.listing_id=b.id AND r.sender_id=$1) AS requested
        FROM board b ${filterByDuoFit} ORDER BY (b.user_id=$1) DESC,b.created_at DESC,b.id DESC LIMIT 40`,
        [...params(userId), fit ? JSON.stringify(fit) : null, windows],
      );
    })(),
    queryRows(
      pairs +
        " SELECT id,status,sender_id,contact,rank_tier,rank_div,platform,accepted_at,can_requeue,my_choice,mutual,can_thank,sent_thanks,received_thanks,adult_pair FROM pairs ORDER BY id DESC LIMIT 40",
      params(userId),
    ),
  ]);
  return {
    listings: rows.map((r) => listing(r, userId)),
    requests: requests.map(
      (r): DuoRequest => ({
        id: Number(r.id),
        incoming: Number(r.sender_id) !== userId,
        rank: rankLabel(String(r.rank_tier), r.rank_div as string | null),
        status: String(r.status),
        riotId: typeof r.contact === "string" ? r.contact : null,
        requeue: !r.can_requeue ? null : r.mutual ? "mutual" : r.my_choice ? "waiting" : "available",
        thanks: r.can_thank || r.sent_thanks || r.received_thanks ? {
          sent: r.sent_thanks === true,
          received: r.received_thanks === true,
          canSend: r.can_thank === true,
          adultPair: r.adult_pair === true,
        } : null,
        matchedAt: r.accepted_at ? new Date(String(r.accepted_at)).toISOString() : null,
        platform: String(r.platform).toUpperCase(),
      }),
    ),
  };
}
export async function createDuoListing(user: User, data: unknown) {
  if (!duoEnabled())
    return { ok: false, error: "Verified duo matching is waiting for Riot Sign On and safety coverage." };
  const parsed = duoPreferences(data);
  if (!parsed.ok) return parsed;
  const { roles, partnerRole, blocks, timeZone, voice, vibe, note } = parsed.value;
  if (!(await duoEligible(user.id)))
    return { ok: false, error: "Duo listings require verified ownership and current ranked game data." };
  if (!(await rateLimit(user.id, "duo-list", 3, 24 * 60)))
    return { ok: false, error: "You can publish three listings per day." };
  const screened = await screenText(parsed.moderation, [note], user.id, "duo");
  if (screened.action === "block")
    return { ok: false, error: "This note cannot be published. Contact safety if you need help." };
  const held = screened.action === "hold";
  // Eight days cover the next week for all viewers throughout the four-hour listing.
  const windows = timeZone ? encodeWindows(scheduleWindows(blocks, timeZone, Date.now(), 8)) : null;
  const sql = await getSql();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('duo-list'),${user.id})`,
    sql(
      eligible +
        ` INSERT INTO wp_lfg (user_id,puuid,roles,champs,blocks,voice,vibe,note,status,safe_listing,partner_role,play_windows)
      SELECT me.id,me.puuid,$3::text[],ARRAY(SELECT c->>'champion' FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(me.snapshot->'champPool')='array' THEN me.snapshot->'champPool' ELSE '[]'::jsonb END) c
        WHERE c->>'champion' ~ '^[A-Za-z0-9]{1,30}$' LIMIT 5),$4::text[],$5::bool,$6,$7,$8,true,$9,$10::int4multirange FROM me
      WHERE NOT EXISTS (SELECT 1 FROM wp_lfg l WHERE l.user_id=$1 AND l.safe_listing AND l.status IN ('open','held') AND l.expires_at>now())
      RETURNING id`,
      [...params(user.id), roles, blocks, voice, vibe, note, held ? "held" : "open", partnerRole, windows],
    ),
  ]);
  return rows.length
    ? { ok: true, held }
    : { ok: false, error: "Close your existing listing first, or refresh your linked player’s stats." };
}
export async function closeDuoListing(userId: number, id: number) {
  const rows =
    await q`UPDATE wp_lfg SET status='closed' WHERE id=${id} AND user_id=${userId} AND status IN ('open','held') RETURNING id`;
  return rows.length ? { ok: true } : missing;
}
export async function duoPeerId(userId: number, kind: "lfg" | "duo_request", id: number) {
  if (!duoEnabled()) return null;
  const rows = await queryRows(
    kind === "lfg"
      ? board + " SELECT user_id AS peer FROM board WHERE id=$3 AND user_id<>$1"
      : pairs +
          " SELECT CASE WHEN owner_id=$1 THEN sender_id ELSE owner_id END AS peer FROM pairs WHERE id=$3",
    [...params(userId), id],
  );
  return rows.length ? Number(rows[0].peer) : null;
}
export async function canReportDuo(userId: number, kind: "lfg" | "duo_request", id: number) {
  if (kind === "duo_request") {
    // A participant can still report an invitation after declining or blocking.
    const rows = await q`SELECT 1 FROM wp_duo_requests r JOIN wp_lfg l ON l.id=r.listing_id
      WHERE r.id=${id} AND ${userId} IN (r.sender_id,l.user_id)`;
    return rows.length > 0;
  }
  return (await duoPeerId(userId, kind, id)) !== null;
}
export async function duoAction(user: User, id: number, action: "request" | "accept" | "decline") {
  const peerId = await duoPeerId(user.id, action === "request" ? "lfg" : "duo_request", id);
  if (!peerId) return missing;
  if (action === "request" && !(await rateLimit(user.id, "duo-request", 6, 60)))
    return { ok: false, error: "You can make six requests per hour." };
  const sql = await getSql();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(least(${user.id}::int,${peerId}::int),greatest(${user.id}::int,${peerId}::int))`,
    action === "request"
      ? sql(
          board +
            ` INSERT INTO wp_duo_requests(listing_id,sender_id,sender_puuid)
      SELECT b.id,me.id,me.puuid FROM board b,me WHERE b.id=$3 AND b.user_id<>me.id AND b.status='open'
      ON CONFLICT(listing_id,sender_id) DO NOTHING RETURNING id`,
          [...params(user.id), id],
        )
      : sql(
          pairs +
            ` UPDATE wp_duo_requests r SET status=$4,accepted_at=CASE WHEN $4='accepted' THEN now() END FROM pairs p WHERE r.id=p.id AND p.id=$3 AND r.status='pending'
      AND (p.owner_id=$1 OR ($4='declined' AND p.sender_id=$1)) RETURNING r.id`,
          [...params(user.id), id, action === "accept" ? "accepted" : "declined"],
        ),
  ]);
  return rows.length ? { ok: true } : missing;
}

// The request determines its two participants. No recipient, message or monetary amount is accepted.
export async function thankDuo(userId: number, requestId: number) {
  if (!duoEnabled()) return missing;
  const peerId = await duoPeerId(userId, "duo_request", requestId);
  if (!peerId) return missing;
  const sql = await getSql();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(least(${userId}::int,${peerId}::int),greatest(${userId}::int,${peerId}::int))`,
    sql(pairs + ` UPDATE wp_duo_requests r SET
      sender_thanked=r.sender_thanked OR p.sender_id=$1, owner_thanked=r.owner_thanked OR p.owner_id=$1
      FROM pairs p WHERE p.id=$3 AND r.id=p.id AND r.status='accepted' AND p.can_thank RETURNING r.id`,
      [...params(userId), requestId]),
  ]);
  return rows.length ? { ok: true } : missing;
}

export async function setRequeue(userId: number, requestId: number, active: boolean) {
  // A withdrawal remains possible even if the other player unlinks before the next refresh.
  if (!active) {
    const rows = await q`UPDATE wp_duo_requests r SET
      sender_requeue=CASE WHEN r.sender_id=${userId} THEN false ELSE r.sender_requeue END,
      owner_requeue=CASE WHEN l.user_id=${userId} THEN false ELSE r.owner_requeue END
      FROM wp_lfg l WHERE r.id=${requestId} AND r.listing_id=l.id AND ${userId} IN (r.sender_id,l.user_id)
      RETURNING r.id`;
    return rows.length ? { ok: true } : missing;
  }
  if (!duoEnabled()) return missing;
  const peerId = await duoPeerId(userId, "duo_request", requestId);
  if (!peerId) return missing;
  const sql = await getSql();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(least(${userId}::int,${peerId}::int),greatest(${userId}::int,${peerId}::int))`,
    sql(
      pairs +
        ` UPDATE wp_duo_requests r SET
      sender_requeue=(r.sender_requeue OR p.sender_id=$1),owner_requeue=(r.owner_requeue OR p.owner_id=$1)
      FROM pairs p WHERE r.id=p.id AND r.id=$3 AND p.can_requeue AND r.status='accepted'
      RETURNING r.id`,
      [...params(userId), requestId],
    ),
  ]);
  return rows.length ? { ok: true } : missing;
}

// Once the four-hour listing expires it disappears immediately. Retain the recent confirmed
// interaction for a 30-day endorsement/report window. Cases and historical records are excluded.
export async function clearExpiredDuoListings() {
  await q`WITH candidates AS (
    SELECT l.id FROM wp_lfg l WHERE l.safe_listing AND l.expires_at<now()-interval '30 days'
      AND l.status NOT IN ('held','removed')
      AND NOT EXISTS(SELECT 1 FROM wp_duo_requests r WHERE r.listing_id=l.id AND r.status IN ('held','removed'))
      AND NOT EXISTS(SELECT 1 FROM wp_reports f WHERE (f.target_kind='lfg' AND f.target_id=l.id)
        OR (f.target_kind='duo_request' AND EXISTS(SELECT 1 FROM wp_duo_requests r WHERE r.listing_id=l.id AND r.id=f.target_id)))
      AND NOT EXISTS(SELECT 1 FROM wp_safety_decisions d WHERE (d.target_kind='lfg' AND d.target_id=l.id)
        OR (d.target_kind='duo_request' AND EXISTS(SELECT 1 FROM wp_duo_requests r WHERE r.listing_id=l.id AND r.id=d.target_id)))
    ORDER BY l.expires_at LIMIT 500
  ) DELETE FROM wp_lfg l USING candidates c WHERE l.id=c.id`;
}
