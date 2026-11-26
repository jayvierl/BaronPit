import { duoEnabled, duoPairsCte, duoPeerId } from "./duo";
import { TERMS_VERSION } from "./account-policy";
import { getSql, q } from "./db";
import type { User } from "./auth";
import { ENDORSE_KINDS } from "./pure";

/* ------------------------------ follows/users ------------------------------ */

export async function setFollow(followerId: number, followeeId: number, follow: boolean): Promise<boolean> {
  if (followerId === followeeId) return false;
  const sql = await getSql();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(least(${followerId}::int,${followeeId}::int),greatest(${followerId}::int,${followeeId}::int))`,
    follow
      ? sql`INSERT INTO wp_follows(follower_id,followee_id)
      SELECT ${followerId},u.id FROM wp_users u WHERE u.id=${followeeId}
      AND u.safety_status='visible' AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id)
        IN ((${followerId},u.id),(u.id,${followerId})))
      ON CONFLICT(follower_id,followee_id) DO UPDATE SET followee_id=excluded.followee_id RETURNING followee_id`
      : sql`DELETE FROM wp_follows WHERE follower_id=${followerId} AND followee_id=${followeeId}`,
  ]);
  return !follow || rows.length > 0;
}
export async function followCounts(userId: number): Promise<{ followers: number; following: number }> {
  const rows = await q`SELECT
    (SELECT count(*)::int FROM wp_follows WHERE followee_id = ${userId}) AS followers,
    (SELECT count(*)::int FROM wp_follows WHERE follower_id = ${userId}) AS following`;
  return { followers: Number(rows[0]?.followers ?? 0), following: Number(rows[0]?.following ?? 0) };
}
export async function isFollowing(followerId: number, followeeId: number): Promise<boolean> {
  const rows =
    await q`SELECT 1 FROM wp_follows WHERE follower_id = ${followerId} AND followee_id = ${followeeId}`;
  return rows.length > 0;
}

/* ------------------------------- endorsements ------------------------------ */

export async function endorse(
  from: User,
  toUserId: number,
  kind: string,
  requestId: number | null = null,
): Promise<{ ok: boolean; error?: string }> {
  if (from.id === toUserId) return { ok: false, error: "You can't endorse yourself." };
  if (!ENDORSE_KINDS.some((k) => k.id === kind)) return { ok: false, error: "Unknown endorsement." };
  if (kind !== "helpful" && !duoEnabled()) return { ok: false, error: "Verified duo matching is paused." };
  const sql = await getSql();
  const [, , rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('endorsements'),${from.id})`,
    sql`SELECT pg_advisory_xact_lock(least(${from.id}::int,${toUserId}::int),greatest(${from.id}::int,${toUserId}::int))`,
    sql(`INSERT INTO wp_endorsements (from_user,to_user,kind,interaction_checked)
      SELECT $1,u.id,$3,true FROM wp_users u WHERE u.id=$4
      AND u.safety_status='visible' AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN (($1,u.id),(u.id,$1)))
      AND (SELECT count(*) FROM wp_endorsements WHERE from_user=$1 AND interaction_checked AND created_at>now()-interval '24 hours')<3
      AND NOT EXISTS(SELECT 1 FROM wp_endorsements WHERE from_user=$1 AND to_user=u.id AND interaction_checked AND created_at>now()-interval '30 days')
      AND (CASE WHEN $3='helpful' THEN EXISTS(
        SELECT 1 FROM wp_comments c JOIN wp_posts p ON p.id=c.post_id WHERE c.author_id=u.id AND p.author_id=$1
        AND p.status='visible' AND p.kind NOT IN ('media','clip') AND c.parent_id IS NULL AND c.status='visible' AND c.created_at>now()-interval '30 days'
      ) ELSE EXISTS(
        ${duoPairsCte} SELECT 1 FROM pairs p WHERE p.status='accepted' AND p.can_thank
          AND ($5::int IS NULL OR p.id=$5)
          AND (p.sender_id,p.owner_id) IN (($1,$4),($4,$1))
      ) END)
      ON CONFLICT(from_user,to_user,kind) DO UPDATE SET interaction_checked=true, created_at=now()
      WHERE NOT wp_endorsements.interaction_checked OR wp_endorsements.created_at<=now()-interval '30 days' RETURNING id`,[from.id, TERMS_VERSION, kind, toUserId, requestId]),
  ]);
  return rows.length
    ? { ok: true }
    : {
        ok: false,
        error:
          "Endorse a recent reply to your post, or a verified duo you played with. You can endorse three players per day and each player once per month.",
      };
}
export async function endorseDuoRequest(from: User, requestId: number) {
  const peer = await duoPeerId(from.id, "duo_request", requestId);
  if (!peer) return { ok: false, error: "This duo request is unavailable." };
  return endorse(from, peer, "good_teammate", requestId);
}
export async function endorsementCounts(userId: number): Promise<Record<string, number>> {
  const rows =
    await q`SELECT kind, count(*)::int AS n FROM wp_endorsements e WHERE e.to_user = ${userId} AND e.interaction_checked AND e.created_at > now() - interval '90 days'
    AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN ((e.from_user,e.to_user),(e.to_user,e.from_user))) GROUP BY kind`;
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.kind)] = Number(r.n);
  return out;
}
