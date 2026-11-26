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
): Promise<{ ok: boolean; error?: string }> {
  if (from.id === toUserId) return { ok: false, error: "You can't endorse yourself." };
  if (!ENDORSE_KINDS.some((k) => k.id === kind)) return { ok: false, error: "Unknown endorsement." };
  const sql = await getSql();
  const [, , rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('endorsements'),${from.id})`,
    sql`SELECT pg_advisory_xact_lock(least(${from.id}::int,${toUserId}::int),greatest(${from.id}::int,${toUserId}::int))`,
    sql`INSERT INTO wp_endorsements (from_user,to_user,kind,interaction_checked)
      SELECT ${from.id},u.id,${kind},true FROM wp_users u WHERE u.id=${toUserId}
      AND u.safety_status='visible' AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN ((${from.id},u.id),(u.id,${from.id})))
      AND (SELECT count(*) FROM wp_endorsements WHERE from_user=${from.id} AND interaction_checked AND created_at>now()-interval '24 hours')<3
      AND NOT EXISTS(SELECT 1 FROM wp_endorsements WHERE from_user=${from.id} AND to_user=u.id AND interaction_checked AND created_at>now()-interval '30 days')
      AND (CASE WHEN ${kind}='helpful' THEN EXISTS(
        SELECT 1 FROM wp_comments c JOIN wp_posts p ON p.id=c.post_id WHERE c.author_id=u.id AND p.author_id=${from.id}
        AND p.status='visible' AND p.kind NOT IN ('media','clip') AND c.parent_id IS NULL AND c.status='visible' AND c.created_at>now()-interval '30 days'
      ) ELSE EXISTS(
        SELECT 1 FROM wp_duo_requests r JOIN wp_lfg l ON l.id=r.listing_id
        JOIN wp_links k ON k.user_id=r.sender_id AND k.verified AND k.puuid=r.sender_puuid
        JOIN wp_links o ON o.user_id=l.user_id AND o.verified AND o.puuid=l.puuid
        JOIN wp_players a ON a.puuid=k.puuid JOIN wp_players d ON d.puuid=o.puuid
        WHERE (r.sender_id,l.user_id) IN ((${from.id},u.id),(u.id,${from.id})) AND r.status='accepted'
          AND r.created_at>now()-interval '30 days' AND l.safe_listing
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.snapshot->'matches') am JOIN jsonb_array_elements(d.snapshot->'matches') dm
            ON am->>'matchId'=dm->>'matchId' WHERE (am->>'playedAt')::bigint >= extract(epoch from r.created_at)*1000
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(am->'teammates') teammate WHERE teammate->>'name'=d.game_name AND teammate->>'tag'=d.tag_line))
      ) END)
      ON CONFLICT(from_user,to_user,kind) DO UPDATE SET interaction_checked=true, created_at=now()
      WHERE NOT wp_endorsements.interaction_checked OR wp_endorsements.created_at<=now()-interval '30 days' RETURNING id`,
  ]);
  return rows.length
    ? { ok: true }
    : {
        ok: false,
        error:
          "Endorse a recent reply to your post, or a verified duo you played with. You can endorse three players per day and each player once per month.",
      };
}
export async function endorsementCounts(userId: number): Promise<Record<string, number>> {
  const rows =
    await q`SELECT kind, count(*)::int AS n FROM wp_endorsements e WHERE e.to_user = ${userId} AND e.interaction_checked AND e.created_at > now() - interval '90 days'
    AND NOT EXISTS(SELECT 1 FROM wp_blocks b WHERE (b.blocker_id,b.blocked_id) IN ((e.from_user,e.to_user),(e.to_user,e.from_user))) GROUP BY kind`;
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.kind)] = Number(r.n);
  return out;
}
