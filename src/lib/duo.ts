import { publicSampleSql } from "./public-match-queues";
import { RANKED_QUEUE, NORMAL_QUEUE, isSessionQueue, type SessionQueue, SESSION_MINUTES, parseSessionOffer, sessionWindow } from "./duo-session";
import { confirmedBeforeCancellation, sharedGame } from "./verified-duo-game";
import { getSql, q, queryRows } from "./db";
import { decodeWindows, encodeWindows, scheduleWindows, type PlayWindow } from "./duo-schedule";
import { filterByDuoFit, loadDuoFit } from "./duo-fit-store";
import { TERMS_VERSION } from "./account-policy";
import type { LeagueTier } from "./rank";
import { placedRank } from "./player-summary";
import { rateLimit, type User } from "./auth";
import { duoPreferences } from "./duo-input";
import { screenText } from "./managed-text-screen";

export const duoEnabled = () => process.env.DUO_MATCHING_ENABLED === "true";
type Row = Record<string, unknown>;
function duoRank(row: Row) {
  const rank = placedRank({
    rankTier: typeof row.rank_tier === "string" ? row.rank_tier : null,
    rankDiv: typeof row.rank_div === "string" ? row.rank_div : null,
  });
  return {rank: rank.rank, rankTier: rank.tier};
}
const missing = { ok: false as const, error: "That listing or request is no longer available." };
export interface DuoListing {
  id: number;
  roles: string[];
  champs: string[];
  blocks: string[];
  playWindows: PlayWindow[];
  start: number | null;
  queue: SessionQueue | null;
  partnerRole: string | null;
  voice: boolean;
  vibe: string;
  note: string;
  rank: string;
  rankTier?: LeagueTier | null;
  form: string | null;
  soloRecord: string | null;
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
  rankTier?: LeagueTier | null;
  riotId: string | null;
  socialProfileId: number | null;
  contactEndsAt: number | null;
  cancellationEndsAt: number | null;
  platform: string;
  requeue: "available" | "waiting" | "mutual" | null;
  matchedAt: string | null;
  session: { queue: SessionQueue; compatible: boolean; start: number; roles: string[]; voice: boolean; vibe: string } | null;
  thanks: { sent: boolean; received: boolean; canSend: boolean; recentlyEndorsed: boolean; adultPair: boolean } | null;
}

// $1 is always the requesting user and $2 the current terms revision. Both participants are
// rechecked at read/accept time. Unlinking Riot, changing bands or blocking withdraws access.
function eligibility(fresh: boolean, viewer: string | null = "$1", terms = "$2") {
  return `WITH eligible AS NOT MATERIALIZED (
  SELECT u.id,u.age_band,p.puuid,p.platform,p.game_name,p.tag_line,p.rank_tier,p.rank_div,p.rank_lp,p.rank_wins,p.rank_losses,p.snapshot,p.fetched_at,k.is_primary,
    CASE WHEN p.rank_div IN ('I','II','III','IV') THEN
      array_position(ARRAY['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD']::text[],p.rank_tier)
    END AS pilot_tier
  FROM wp_users u JOIN wp_links k ON k.user_id=u.id AND k.verified
  JOIN wp_players p ON p.puuid=k.puuid
  WHERE u.terms_version=${terms} AND u.safety_status='visible' AND u.age_band IN ('adult','teen') AND u.terms_accepted_at IS NOT NULL
    AND u.created_at<=now()-interval '24 hours' AND (u.banned_until IS NULL OR u.banned_until<=now())
    AND NOT EXISTS(SELECT 1 FROM wp_links contested WHERE contested.puuid=k.puuid AND contested.verified AND contested.user_id<>k.user_id)
    AND p.rank_tier IS NOT NULL ${fresh ? "AND p.fetched_at>now()-interval '24 hours'" : ""}
    AND jsonb_typeof(p.snapshot->'matches')='array' AND p.snapshot->'matches'->0 IS NOT NULL
)${viewer ? `, me AS (SELECT e.* FROM eligible e WHERE e.id=${viewer} ORDER BY e.is_primary DESC,e.puuid LIMIT 1)` : ""}`;
}
const eligible = eligibility(true);
// An existing accepted pair may refresh its stale stats without gaining contact or board access.
export const duoIdentityCte = eligibility(false);
// Riot's published NA Solo/Duo bands through Emerald. The client decides final queue eligibility.
// https://support.riotgames.com/en-us/league-of-legends/gameplay/ranked-tiers-divisions-and-queues
function sessionCompatible(queue: string, first: string, second: string) {
  return `(${queue}='${NORMAL_QUEUE}' OR (${queue}='${RANKED_QUEUE}'
    AND ${first}.pilot_tier IS NOT NULL AND ${second}.pilot_tier IS NOT NULL
    AND (abs(${first}.pilot_tier-${second}.pilot_tier)<=1 OR greatest(${first}.pilot_tier,${second}.pilot_tier)<=3)))`;
}
// Accepted sessions reserve both players until the end of the agreed hour.
function bookedSession(listing: string, participant: string, exceptRequest?: string) {
  return `EXISTS(SELECT 1 FROM wp_duo_requests booking JOIN wp_lfg booked ON booked.id=booking.listing_id
    WHERE booking.status='accepted' AND booking.cancelled_at IS NULL AND booked.safe_listing AND booked.session_queue IN ('${NORMAL_QUEUE}','${RANKED_QUEUE}')
      AND (${participant} IN (booking.sender_id,booked.user_id))
      AND booked.session_start < ${listing}.expires_at AND ${listing}.session_start < booked.expires_at
      ${exceptRequest ? `AND booking.id<>${exceptRequest}` : ""})`;
}

/** Return an invitation to its original state only while its original session and both players are eligible. */
export function reviewedDuoRequestState(request: string, hold: string) {
  return `CASE WHEN ${request}.status='declined' OR ${request}.cancelled_at IS NOT NULL THEN 'declined'
    WHEN $5::boolean AND EXISTS (${eligibility(true, null, "$4")}
      SELECT 1 FROM wp_lfg l JOIN eligible owner ON owner.id=l.user_id AND owner.puuid=l.puuid
      JOIN eligible sender ON sender.id=${request}.sender_id AND sender.puuid=${request}.sender_puuid
      WHERE l.id=${request}.listing_id AND l.safe_listing AND l.status='open' AND l.expires_at>clock_timestamp()
        AND owner.platform='na1' AND owner.platform=sender.platform AND owner.age_band=sender.age_band
        AND ${sessionCompatible("l.session_queue", "owner", "sender")} AND ${request}.offered_role IS NOT NULL
        AND ((${hold}.prior_status='pending' AND l.session_start>clock_timestamp()) OR (${hold}.prior_status='accepted'
          AND ${request}.accepted_at BETWEEN ${request}.created_at AND least(l.session_start,clock_timestamp())))
        AND NOT ${bookedSession("l", "l.user_id", `${request}.id`)}
        AND NOT ${bookedSession("l", `${request}.sender_id`, `${request}.id`)}
        AND NOT EXISTS (SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN ((owner.id,sender.id),(sender.id,owner.id)))
        AND NOT EXISTS (SELECT 1 FROM wp_mutes m WHERE (m.muter_id,m.muted_id) IN ((owner.id,sender.id),(sender.id,owner.id)))
    ) THEN ${hold}.prior_status ELSE 'declined' END`;
}
const board = `${eligible}, board AS (
  SELECT l.*,peer.platform,peer.rank_tier,peer.rank_div,peer.rank_lp,peer.rank_wins,peer.rank_losses,
    CASE WHEN ${publicSampleSql('peer.snapshot')} THEN peer.snapshot->>'wins' END AS wins,
    CASE WHEN ${publicSampleSql('peer.snapshot')} THEN peer.snapshot->>'games' END AS games
  FROM me JOIN eligible peer ON peer.age_band=me.age_band AND peer.platform=me.platform
  JOIN wp_lfg l ON l.puuid=peer.puuid AND l.user_id=peer.id
  WHERE l.safe_listing AND l.expires_at>now()
    AND (l.status='open' OR (l.status='held' AND l.user_id=me.id))
    AND (l.user_id=me.id OR (me.platform='na1' AND ${sessionCompatible("l.session_queue","peer","me")} AND l.session_start>now()
      AND NOT ${bookedSession("l", "l.user_id")} AND NOT ${bookedSession("l", "me.id")}))
    AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN ((me.id,peer.id),(peer.id,me.id)))
    AND NOT EXISTS(SELECT 1 FROM wp_mutes m WHERE (m.muter_id,m.muted_id) IN ((me.id,peer.id),(peer.id,me.id)))
)`;
const ownRequeue = `CASE WHEN r.sender_id=$1 THEN r.sender_requeue ELSE r.owner_requeue END`;
const activeBookingWindow = `l.session_queue IN ('${NORMAL_QUEUE}','${RANKED_QUEUE}')
  AND l.session_start<l.expires_at AND l.expires_at>clock_timestamp()`;
const cancelledBooking = "r.status='declined' AND r.cancelled_at IS NOT NULL";
const acceptedBooking = "r.status='accepted' AND r.cancelled_at IS NULL";
function pairScope(recentlyExpired = false) {
  return `${eligible}, pairs AS (
  SELECT r.id,r.status,r.sender_id,l.user_id AS owner_id,r.listing_id,r.created_at,r.accepted_at,r.cancelled_at,l.expires_at,
    l.session_start,l.session_queue,r.offered_role,r.offered_voice,r.offered_vibe,l.roles,l.vibe,l.voice,
    ${sessionCompatible("l.session_queue","owner","sender")} AS compatible,
    ${ownRequeue} AS my_choice,
    (${acceptedBooking} AND r.accepted_at IS NOT NULL AND ${activeBookingWindow}) AS can_cancel,
    ${acceptedBooking} AND game.played AND NOT EXISTS (SELECT 1 FROM wp_reports f WHERE f.status='open'
      AND ((f.target_kind='duo_request' AND f.target_id=r.id) OR (f.target_kind='lfg' AND f.target_id=l.id))) AS can_thank,
    CASE WHEN r.sender_id=$1 THEN r.sender_thanked ELSE r.owner_thanked END AS sent_thanks,
    CASE WHEN r.sender_id=$1 THEN r.owner_thanked ELSE r.sender_thanked END AS received_thanks,
    sender.age_band='adult' AND owner.age_band='adult' AS adult_pair,
    ${acceptedBooking} AND r.sender_requeue AND r.owner_requeue AS mutual,
    ${acceptedBooking} AND (game.played OR ${ownRequeue}) AS can_requeue,
    CASE WHEN r.sender_id=$1 THEN owner.rank_tier ELSE sender.rank_tier END AS rank_tier,
    CASE WHEN r.sender_id=$1 THEN owner.rank_div ELSE sender.rank_div END AS rank_div,
    CASE WHEN ${acceptedBooking} AND ((l.expires_at>now() AND l.status='open') OR (r.sender_requeue AND r.owner_requeue)) THEN
      CASE WHEN r.sender_id=$1 THEN owner.game_name||'#'||owner.tag_line ELSE sender.game_name||'#'||sender.tag_line END
    END AS contact,owner.platform
  FROM wp_duo_requests r JOIN wp_lfg l ON l.id=r.listing_id
  JOIN eligible owner ON owner.id=l.user_id AND owner.puuid=l.puuid
  JOIN eligible sender ON sender.id=r.sender_id AND sender.puuid=r.sender_puuid
  CROSS JOIN LATERAL (SELECT CASE WHEN ${acceptedBooking} AND r.accepted_at IS NOT NULL THEN ${sharedGame}
    WHEN ${cancelledBooking} THEN ${confirmedBeforeCancellation} ELSE false END AS played) game
  WHERE $1 IN (l.user_id,r.sender_id) AND l.safe_listing
    AND ((l.status='open' AND l.expires_at>now())
      OR (l.status='closed' AND ${acceptedBooking} AND ${activeBookingWindow})
      ${recentlyExpired ? `OR (l.status='open' AND l.expires_at<=now() AND l.expires_at>now()-interval '24 hours')
      OR (l.status='closed' AND ${cancelledBooking})` : ""} OR
      (l.status IN ('open','closed') AND ((${acceptedBooking}) OR (${cancelledBooking})) AND r.accepted_at>now()-interval '30 days'
       AND (game.played OR ${ownRequeue} OR r.sender_thanked OR r.owner_thanked)))
    AND owner.age_band=sender.age_band AND owner.platform=sender.platform
    AND ((r.status='pending' AND r.cancelled_at IS NULL) OR (${acceptedBooking}) OR (${cancelledBooking}))
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
  return (await queryRows(eligible + " SELECT 1 FROM me WHERE platform='na1'", params(userId))).length > 0;
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
    queue: isSessionQueue(row.session_queue) ? row.session_queue : null,
    start: isSessionQueue(row.session_queue) && row.session_start ? new Date(String(row.session_start)).getTime() : null,
    partnerRole: typeof row.partner_role === "string" ? row.partner_role : null,
    voice: row.voice === true,
    vibe: String(row.vibe),
    note: String(row.note),
    platform: String(row.platform).toUpperCase(),
    ...duoRank(row),
    form: row.wins != null && Number.isInteger(wins) && wins >= 0 && Number.isInteger(games) && games > 0 && games <= 20 && wins <= games
      ? `${wins}W · ${games - wins}L in ${games} games` : null,
    soloRecord: typeof row.rank_wins === "number" && row.rank_wins >= 0 && typeof row.rank_losses === "number" && row.rank_losses >= 0
      ? `${row.rank_wins}W · ${row.rank_losses}L` : null,
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
      const windows = fit?.blocks.length ? encodeWindows(scheduleWindows(fit.blocks, fit.timeZone, asOf, 1)) : null;
      return queryRows(
        board +
          ` SELECT b.id,b.user_id,b.roles,b.champs,b.blocks,b.play_windows::text AS play_windows,b.session_queue,b.session_start,b.partner_role,b.voice,b.vibe,b.note,b.rank_tier,b.rank_div,b.rank_wins,b.rank_losses,b.wins,b.games,b.platform,b.expires_at,b.status,
        EXISTS(SELECT 1 FROM wp_duo_requests r WHERE r.listing_id=b.id AND r.sender_id=$1) AS requested
        FROM board b ${filterByDuoFit} ORDER BY (b.user_id=$1) DESC,(b.session_queue='${RANKED_QUEUE}') DESC NULLS LAST,b.created_at DESC,b.id DESC LIMIT 40`,
        [...params(userId), fit ? JSON.stringify(fit) : null, windows],
      );
    })(),
    queryRows(
      pairs +
        ` SELECT id,status,sender_id,contact,expires_at,cancelled_at,can_cancel,
          CASE WHEN contact IS NOT NULL AND session_queue='${RANKED_QUEUE}'
            THEN CASE WHEN sender_id=$1 THEN owner_id ELSE sender_id END END AS social_profile_id,
          EXISTS(SELECT 1 FROM wp_endorsements e WHERE e.from_user=$1 AND e.interaction_checked AND
            e.to_user=CASE WHEN pairs.sender_id=$1 THEN pairs.owner_id ELSE pairs.sender_id END
            AND e.created_at>now()-interval '30 days') AS recently_endorsed,
          compatible,rank_tier,rank_div,platform,accepted_at,can_requeue,my_choice,mutual,can_thank,sent_thanks,received_thanks,adult_pair,session_start,session_queue,offered_role,offered_voice,offered_vibe,roles,voice,vibe FROM pairs ORDER BY id DESC LIMIT 40`,
      params(userId),
    ),
  ]);
  return {
    listings: rows.map((r) => listing(r, userId)),
    requests: requests.map(
      (r): DuoRequest => ({
        id: Number(r.id),
        incoming: Number(r.sender_id) !== userId,
        ...duoRank(r),
        status: r.cancelled_at ? "cancelled" : String(r.status),
        session: isSessionQueue(r.session_queue) && r.session_start && typeof r.offered_role === "string" ? {
          queue: r.session_queue, compatible: r.compatible === true,
          start: new Date(String(r.session_start)).getTime(),
          roles: Number(r.sender_id) === userId ? r.roles as string[] : [r.offered_role],
          voice: (Number(r.sender_id) === userId ? r.voice : r.offered_voice) === true,
          vibe: String(Number(r.sender_id) === userId ? r.vibe : r.offered_vibe),
        } : null,
        contactEndsAt: r.contact && !r.mutual ? new Date(String(r.expires_at)).getTime() : null,
        cancellationEndsAt: r.can_cancel === true ? new Date(String(r.expires_at)).getTime() : null,
        socialProfileId: r.social_profile_id == null ? null : Number(r.social_profile_id),
        riotId: typeof r.contact === "string" ? r.contact : null,
        requeue: !r.can_requeue ? null : r.mutual ? "mutual" : r.my_choice ? "waiting" : "available",
        thanks: r.can_thank || r.sent_thanks || r.received_thanks ? {
          sent: r.sent_thanks === true,
          received: r.received_thanks === true,
          canSend: r.can_thank === true,
          recentlyEndorsed: r.recently_endorsed === true,
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
  const { start, queue, roles, partnerRole, blocks, voice, vibe, note } = parsed.value;
  if (!(await duoEligible(user.id)))
    return { ok: false, error: "Duo listings require verified ownership and current ranked game data." };
  if (!(await rateLimit(user.id, "duo-list", 3, 24 * 60)))
    return { ok: false, error: "You can publish three listings per day." };
  const screened = await screenText(parsed.moderation, [note], user.id, "duo");
  if (screened.action === "block")
    return { ok: false, error: "This note cannot be published. Contact safety if you need help." };
  const held = screened.action === "hold";
  const windows = encodeWindows([sessionWindow(start)]);
  const sql = await getSql();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('duo-session'),${user.id})`,
    sql(
      eligible +
        `, proposed AS (SELECT id,$12::timestamptz AS session_start,$12::timestamptz + interval '${SESSION_MINUTES} minutes' AS expires_at FROM me)
      INSERT INTO wp_lfg (user_id,puuid,roles,champs,blocks,voice,vibe,note,status,safe_listing,partner_role,play_windows,session_queue,session_start,expires_at)
      SELECT me.id,me.puuid,$3::text[],ARRAY(SELECT c->>'champion' FROM jsonb_array_elements(
        CASE WHEN ${publicSampleSql('me.snapshot')} AND jsonb_typeof(me.snapshot->'champPool')='array' THEN me.snapshot->'champPool' ELSE '[]'::jsonb END) c
        WHERE c->>'champion' ~ '^[A-Za-z0-9]{1,30}$' LIMIT 5),$4::text[],$5::bool,$6,$7,$8,true,$9,$10::int4multirange,$11,proposed.session_start,proposed.expires_at FROM me JOIN proposed ON proposed.id=me.id
      WHERE me.platform='na1' AND ($11='${NORMAL_QUEUE}' OR me.pilot_tier IS NOT NULL) AND proposed.session_start>clock_timestamp() AND NOT ${bookedSession("proposed","me.id")} AND NOT EXISTS (SELECT 1 FROM wp_lfg l WHERE l.user_id=$1 AND l.safe_listing AND l.status IN ('open','held') AND l.expires_at>now())
      RETURNING id`,
      [...params(user.id), roles, blocks, voice, vibe, note, held ? "held" : "open", partnerRole, windows, queue, new Date(start).toISOString()],
    ),
  ]);
  return rows.length
    ? { ok: true, held }
    : { ok: false, error: "Choose an upcoming time without another booking and close any open listing before posting." };
}
export async function closeDuoListing(userId: number, id: number) {
  const sql = await getSql();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"wp-review:lfg:" + id}))`,
    sql`WITH closed AS (
      UPDATE wp_lfg l SET status=CASE WHEN l.status='removed' THEN l.status ELSE 'closed' END
      WHERE l.id=${id} AND l.user_id=${userId} AND (l.status IN ('open','held','closed') OR (l.status='removed' AND EXISTS (
        SELECT 1 FROM wp_safety_holds WHERE target_kind='lfg' AND target_id=l.id))) RETURNING l.id
    ), preserve_closure AS (
      UPDATE wp_safety_holds h SET prior_status='closed' FROM closed c WHERE h.target_kind='lfg' AND h.target_id=c.id
    ) SELECT id FROM closed`,
  ]);
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

export async function cancelDuoBooking(userId: number, id: number) {
  // A participant can release their booking even if another participant or staff has restricted access.
  const [booking] = await q`SELECT CASE WHEN r.sender_id=${userId} THEN l.user_id ELSE r.sender_id END AS peer_id
    FROM wp_duo_requests r JOIN wp_lfg l ON l.id=r.listing_id
    WHERE r.id=${id} AND ${userId}::int IN (r.sender_id,l.user_id) AND l.safe_listing`;
  if (!booking) return missing;
  const first = Math.min(userId, Number(booking.peer_id)), second = Math.max(userId, Number(booking.peer_id));
  const sql = await getSql();
  const [, , , , rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"wp-review:duo_request:" + id}))`,
    sql`SELECT pg_advisory_xact_lock(hashtext('duo-session'),${first}::int)`,
    sql`SELECT pg_advisory_xact_lock(hashtext('duo-session'),${second}::int)`,
    sql`SELECT pg_advisory_xact_lock(${first}::int,${second}::int)`,
    sql(`WITH cancelled AS (
      UPDATE wp_duo_requests r SET status=CASE WHEN r.status IN ('held','removed') THEN r.status ELSE 'declined' END,
        cancelled_at=coalesce(r.cancelled_at,clock_timestamp()),sender_requeue=false,owner_requeue=false
      FROM wp_lfg l WHERE r.id=$1 AND r.listing_id=l.id AND $2::int IN (r.sender_id,l.user_id) AND l.safe_listing
        AND (r.cancelled_at IS NOT NULL OR (r.accepted_at IS NOT NULL AND ${activeBookingWindow}
          AND (r.status='accepted' OR (r.status IN ('held','removed') AND EXISTS (
            SELECT 1 FROM wp_safety_holds h WHERE h.target_kind='duo_request' AND h.target_id=r.id AND h.prior_status='accepted')))))
      RETURNING r.id
    ), preserve_cancellation AS (
      UPDATE wp_safety_holds h SET prior_status='declined' FROM cancelled c
      WHERE h.target_kind='duo_request' AND h.target_id=c.id
    ) SELECT id FROM cancelled`, [id, userId]),
  ]);
  return rows.length ? { ok: true } : missing;
}

async function declineDuoRequest(userId: number, id: number) {
  const sql = await getSql();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"wp-review:duo_request:" + id}))`,
    sql`WITH declined AS (
      UPDATE wp_duo_requests r SET status=CASE WHEN r.status IN ('held','removed') THEN r.status ELSE 'declined' END,
        sender_requeue=false,owner_requeue=false
      FROM wp_lfg l WHERE r.id=${id} AND r.listing_id=l.id AND ${userId}::int IN (r.sender_id,l.user_id)
        AND (r.status IN ('pending','declined') OR (r.status IN ('held','removed') AND EXISTS (
          SELECT 1 FROM wp_safety_holds WHERE target_kind='duo_request' AND target_id=r.id))) RETURNING r.id
    ), preserve_withdrawal AS (
      UPDATE wp_safety_holds h SET prior_status='declined' FROM declined d
      WHERE h.target_kind='duo_request' AND h.target_id=d.id
    ) SELECT id FROM declined`,
  ]);
  return rows.length ? { ok: true } : missing;
}

export async function duoAction(user: User, id: number, action: "request" | "accept" | "decline", input?: unknown) {
  if (action === "decline") return declineDuoRequest(user.id, id);
  const offer = action === "request" ? parseSessionOffer(input) : null;
  if (action === "request" && !offer) return { ok: false, error: "Confirm the session time, your role, playstyle and voice choice." };
  const peerId = await duoPeerId(user.id, action === "request" ? "lfg" : "duo_request", id);
  if (!peerId) return missing;
  if (action === "request" && !(await rateLimit(user.id, "duo-request", 6, 60)))
    return { ok: false, error: "You can make six requests per hour." };
  const sql = await getSql();
  // Serialize bookings for each player as well as reciprocal safety actions. Competing invites
  // to different listings can involve the same player; pair-only locks would allow double-booking.
  const [, , , rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('duo-session'),least(${user.id}::int,${peerId}::int))`,
    sql`SELECT pg_advisory_xact_lock(hashtext('duo-session'),greatest(${user.id}::int,${peerId}::int))`,
    sql`SELECT pg_advisory_xact_lock(least(${user.id}::int,${peerId}::int),greatest(${user.id}::int,${peerId}::int))`,
    action === "request" && offer
      ? sql(
          board +
            ` INSERT INTO wp_duo_requests(listing_id,sender_id,sender_puuid,offered_role,offered_voice,offered_vibe)
      SELECT b.id,me.id,me.puuid,$6,$7,$8 FROM board b,me WHERE b.id=$3 AND b.user_id<>me.id AND b.status='open'
      AND b.session_queue=$4 AND b.session_start=$5::timestamptz AND b.session_start>clock_timestamp()
      AND (b.partner_role='Any' OR b.partner_role=$6 OR $6='Fill')
      ON CONFLICT(listing_id,sender_id) DO NOTHING RETURNING id`,
          [...params(user.id), id, offer.queue, new Date(offer.start).toISOString(), offer.role, offer.voice, offer.vibe],
        )
      : sql(
          pairs +
            `, changed AS (UPDATE wp_duo_requests r SET status='accepted',accepted_at=now() FROM pairs p
        WHERE r.id=p.id AND p.id=$3 AND r.status='pending'
          AND p.owner_id=$1 AND p.compatible AND p.platform='na1' AND p.session_start>clock_timestamp()
          AND p.offered_role IS NOT NULL AND NOT ${bookedSession("p", "p.owner_id")} AND NOT ${bookedSession("p", "p.sender_id")}
        RETURNING r.id,r.listing_id,r.sender_id), cleared AS (
        UPDATE wp_duo_requests other SET status='declined' FROM changed c,wp_lfg other_listing, pairs p
        WHERE p.id=c.id AND other.listing_id=other_listing.id AND other.status='pending' AND other.id<>c.id
          AND other_listing.session_start<p.expires_at AND p.session_start<other_listing.expires_at
          AND (p.owner_id IN (other.sender_id,other_listing.user_id) OR p.sender_id IN (other.sender_id,other_listing.user_id)))
        SELECT id FROM changed`,
          [...params(user.id), id],
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
