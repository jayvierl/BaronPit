import { insertSubmission, priorSubmission, submissionHash, validSubmissionId, type SubmissionResult } from "./submissions";
import { includesRoomLink, roomWriteError } from "./room-safety";
import { inProbation } from "./account-policy";
import { validId } from "./ids";
import type { DecisionContext } from "./decisions-input";
import { preparePost, scoreSubmission, type CreatePostInput } from "./post-input";
export type { CreatePostInput } from "./post-input";
import { rankLabel } from "./rank";
import { HIDDEN_AUTHORS, visibleCommentsFor, visiblePostForInteraction } from "./community-queries";
import { readPosts, readComments } from "./post-reader";
import type { PostView, CommentView } from "./post-types";
export type { PostView, CommentView } from "./post-types";

import { getSql, q, queryRows } from "./db";
import { screenText } from "./managed-text-screen";
import { scoreContent, bodyFingerprint } from "./moderation";
import { rateLimit, type User } from "./auth";
import { confirmedPatch } from "./riot";
import { REACTION_EMOJIS, ENDORSE_KINDS } from "./pure";

export { REACTION_EMOJIS, ENDORSE_KINDS };

import { listRooms } from "./rooms";
export { ensureRooms, getRoom, listRooms, setRoomMembership } from "./rooms";
export type { Room } from "./rooms";
export { runPatchWatch } from "./patch-briefings";
export { dailyHighlight, todaysSpotlight } from "./player-insights";

/* ---------------------------------- posts ---------------------------------- */

export type CreateResult = SubmissionResult;
const badKey = { ok: false as const, error: "This draft identifier is invalid. Start a new submission." };

export async function createPost(user: User, input: CreatePostInput, decision?: DecisionContext, decisionHash?: string): Promise<CreateResult> {
  const key = input.submissionId ?? null;
  if (key !== null && !validSubmissionId(key)) return badKey;
  const hash = key ? decisionHash ?? submissionHash([input.kind,input.body,input.roomId ?? null,input.data ?? null,decision ?? null]) : null;
  const replay = await priorSubmission("post",user.id,key,hash);
  if (replay) return replay;
  if (!(await rateLimit(user.id, "post", 30, 60))) return { ok: false, error: "You're posting too fast — take a breath and try again in a bit." };
  const draft = await preparePost(input);
  if (!draft.ok) return draft;
  const { body, data, roomId, fields } = draft;
  const lowTrust = inProbation(user.createdAt);
  const mod = await screenText(scoreSubmission(fields, lowTrust), fields, user.id, "post");
  if (mod.action === "block") {
    await q`INSERT INTO wp_mod_log (target_kind, author_id, score, action, detail)
            VALUES ('post', ${user.id}, ${mod.score}, 'block', ${mod.hits.join(",")})`;
    return { ok: false, error: "That post can't be published — it trips our community safety filter. If you think this is a mistake, rephrase and try again." };
  }
  if (mod.action === "hold" && !input.submitForReview && !mod.hits.includes("screening-unavailable")) {
    return { ok: false, reconsider: true, error: "This wording may break the community guidelines. Edit your draft or submit it for a moderator to review." };
  }
  // Duplicate spam: identical body three times in an hour -> hold.
  let status: "visible" | "held" = mod.action === "hold" ? "held" : "visible";
  // A provider link is never published automatically.
  if (input.kind === "clip" || lowTrust) status = "held";
  if (status === "visible" && body.length > 0) {
    const fp = bodyFingerprint(body);
    const recent = await q`SELECT body FROM wp_posts WHERE author_id = ${user.id} AND created_at > now() - interval '1 hour'`;
    if (recent.filter((r) => bodyFingerprint(String(r.body)) === fp).length >= 2) status = "held";
  }

  let rows;
  try {
    const sql = await getSql();
    rows = await insertSubmission(sql,sql`WITH inserted AS (
    INSERT INTO wp_posts (author_id, kind, body, room_id, data, status, clip_review_required, card_validated, submission_id, submission_hash)
    SELECT ${user.id}, ${input.kind}, ${body}, ${roomId}::int, ${JSON.stringify(data)}::jsonb, ${status}, ${input.kind === "clip"}, ${input.kind === "card"}, ${key}::uuid, ${hash}
    WHERE CASE WHEN EXISTS(SELECT 1 FROM wp_posts WHERE author_id=${user.id} AND submission_id=${key}::uuid)
      THEN false ELSE wp_reserve_room_turn(${roomId}::int,${user.id},${input.kind==="clip"||includesRoomLink(fields)}) END
    ON CONFLICT (author_id,submission_id) WHERE submission_id IS NOT NULL DO NOTHING
    RETURNING id
  ), question AS (
    INSERT INTO wp_decisions (post_id,champion,opponent,role,topic,patch,item_id,item_name)
    SELECT id,${decision?.champion ?? null}::text,${decision?.opponent ?? null}::text,${decision?.role ?? null}::text,${decision?.topic ?? null}::text,${decision?.patch ?? null}::text,${decision?.itemId ?? null}::int,${decision?.itemName ?? null}::text
    FROM inserted WHERE ${!!decision}
  ), audit AS (
    INSERT INTO wp_mod_log (target_kind, target_id, author_id, score, action, detail)
    SELECT 'post',id,${user.id},${mod.score},'hold',${mod.hits.join(",")} FROM inserted WHERE ${status}='held'
  ) SELECT id FROM inserted`,key,user.id);
  } catch(error) { return await priorSubmission("post",user.id,key,hash) ?? {ok:false,error:roomWriteError(error)}; }
  if (!rows.length) return await priorSubmission("post",user.id,key,hash) ?? { ok: false, error: "That room is unavailable." };
  const postId = Number(rows[0].id);
  return { ok: true, postId, status };
}

export function feed(viewer: User | null, tab: "following" | "everyone", roomId?: number, limit = 30): Promise<PostView[]> {
  return readPosts(viewer?.id ?? null, { roomId, activeReplies: !roomId && tab === "everyone", following: !roomId && !!viewer && tab === "following" }, limit);
}

export function feedByAuthor(authorId: number, viewer: User | null, limit = 20): Promise<PostView[]> {
  return readPosts(viewer?.id ?? null, { authorId }, limit);
}

export function buildFeed(viewer: User | null, filters: { champion?: string; offMeta?: boolean }): Promise<PostView[]> {
  return readPosts(viewer?.id ?? null, { builds: filters }, 100);
}

export async function getPost(postId: number, viewer: User | null): Promise<PostView | null> {
  if (!validId(postId)) return null;
  const [post] = await readPosts(viewer?.id ?? null, { postId }, 1);
  return post ?? null;
}

export async function votePoll(user: User, postId: number, optionIdx: number): Promise<boolean> {
  if (!validId(postId) || !Number.isInteger(optionIdx) || optionIdx < 0 || optionIdx > 3) return false;
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}
    INSERT INTO wp_poll_votes (post_id, user_id, option_idx)
    SELECT p.id, $1, $3::int FROM wp_posts p WHERE p.id = $2 AND p.kind = 'poll' AND ${visiblePostForInteraction}
      AND CASE WHEN jsonb_typeof(p.data->'options') = 'array' THEN
        jsonb_array_length(p.data->'options') BETWEEN 2 AND 4
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.data->'options') v(option)
          WHERE jsonb_typeof(v.option) <> 'string' OR length(v.option #>> '{}') NOT BETWEEN 1 AND 60)
        AND $3 < jsonb_array_length(p.data->'options')
        ELSE FALSE END
    ON CONFLICT (post_id, user_id) DO UPDATE SET option_idx = EXCLUDED.option_idx RETURNING post_id`,
  [user.id, postId, optionIdx]);
  return rows.length > 0;
}

/* --------------------------------- comments -------------------------------- */

export async function listComments(postId: number, viewer: User | null): Promise<CommentView[]> {
  if (!validId(postId)) return [];
  return readComments(postId, viewer?.id ?? null);
}

export async function addComment(user: User, postId: number, bodyRaw: string, parentId?: number, oneFix = false, submitForReview = false, key: string | null = null): Promise<CreateResult> {
  if (!validId(postId) || (parentId != null && !validId(parentId))) return { ok: false, error: "Conversation unavailable." };
  const body = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
  if (body.length < 1 || body.length > 1000) return { ok: false, error: "Comments are 1–1000 characters." };
  if (oneFix && parentId != null) return { ok: false, error: "Start a new One Fix directly on the game card." };
  if (key !== null && !validSubmissionId(key)) return badKey;
  const hash = key ? submissionHash([postId,body,parentId ?? null,oneFix]) : null;
  const replay = await priorSubmission("comment",user.id,key,hash);
  if (replay) return replay;
  if (!(await rateLimit(user.id, "comment", 60, 60))) return { ok: false, error: "You're commenting too fast — slow down a little." };
  const lowTrust = inProbation(user.createdAt);
  const mod = await screenText(scoreContent(body, { lowTrust }), [body], user.id, "comment");
  if (mod.action === "block") {
    await q`INSERT INTO wp_mod_log (target_kind, author_id, score, action, detail) VALUES ('comment', ${user.id}, ${mod.score}, 'block', ${mod.hits.join(",")})`;
    return { ok: false, error: "That comment can't be published — it trips our community safety filter." };
  }
  if (mod.action === "hold" && !submitForReview && !mod.hits.includes("screening-unavailable")) {
    return { ok: false, reconsider: true, error: "This reply may break the guidelines. Edit it or submit for moderator review." };
  }
  const status = lowTrust || mod.action === "hold" ? "held" : "visible";
  let rows;
  try {
    const sql = await getSql();
    rows = await insertSubmission(sql,sql(`WITH ${HIDDEN_AUTHORS}, candidate AS MATERIALIZED (
    SELECT p.id,p.room_id FROM wp_posts p WHERE p.id=$2 AND ${visiblePostForInteraction} AND (NOT $6 OR p.kind='card')
      AND ($3::int IS NULL OR EXISTS (
        SELECT 1 FROM wp_comments c WHERE c.id=$3 AND c.post_id=p.id AND c.parent_id IS NULL
          AND c.status='visible' AND c.author_id NOT IN (SELECT id FROM hidden)))
  ), submitted AS (
    INSERT INTO wp_comments(post_id,author_id,parent_id,body,status,one_fix,submission_id,submission_hash)
    SELECT id,$1,$3::int,$4,$5,$6::boolean,$10::uuid,$11 FROM candidate
    WHERE CASE WHEN EXISTS(SELECT 1 FROM wp_comments WHERE author_id=$1 AND submission_id=$10::uuid)
      THEN false ELSE wp_reserve_room_turn(room_id,$1,$9) END
    ON CONFLICT (author_id,submission_id) WHERE submission_id IS NOT NULL DO NOTHING
    RETURNING id
  ), hold_log AS (
    INSERT INTO wp_mod_log (target_kind, target_id, author_id, score, action, detail)
    SELECT 'comment', id, $1, $7, 'hold', $8 FROM submitted WHERE $5 = 'held'
  ) SELECT id FROM submitted`,
  [user.id, postId, parentId ?? null, body, status, oneFix, mod.score, mod.hits.join(","),includesRoomLink([body]),key,hash]),key,user.id);
  } catch(error) { return await priorSubmission("comment",user.id,key,hash) ?? {ok:false,error:roomWriteError(error)}; }
  if (!rows.length) return await priorSubmission("comment",user.id,key,hash) ?? { ok: false, error: oneFix ? "One Fix needs an available game card." : "That post or reply is unavailable." };
  return { ok: true, postId: Number(rows[0].id), status };
}

export async function toggleReaction(user: User, kind: "post" | "comment", targetId: number, emoji: string, active?: boolean): Promise<boolean> {
  if (!validId(targetId) || !(REACTION_EMOJIS as readonly string[]).includes(emoji)) return false;
  const target = kind === "post"
    ? `eligible AS (SELECT p.id FROM wp_posts p WHERE p.id = $2 AND ${visiblePostForInteraction})`
    : `${visibleCommentsFor("comment")}, eligible AS (SELECT id FROM thread WHERE id = $2)`;
  const rows = await queryRows(`WITH RECURSIVE ${HIDDEN_AUTHORS}, ${target}, desired AS (
    SELECT id, coalesce($5::boolean, NOT EXISTS (SELECT 1 FROM wp_reactions WHERE
      user_id = $1 AND target_kind = $3 AND target_id = $2 AND emoji = $4)) AS active FROM eligible
  ), added AS (
    INSERT INTO wp_reactions (user_id, target_kind, target_id, emoji)
    SELECT $1, $3, id, $4 FROM desired WHERE active ON CONFLICT DO NOTHING
  ), removed AS (
    DELETE FROM wp_reactions r USING desired d WHERE NOT d.active AND r.user_id = $1 AND r.target_kind = $3 AND r.target_id = d.id AND r.emoji = $4
  ) SELECT active FROM desired`, [user.id, targetId, kind, emoji, active ?? null]);
  return rows.length > 0;
}

export { setFollow, followCounts, isFollowing, endorse, endorsementCounts } from "./relationships";

/* ------------------------------- reports etc ------------------------------- */

export async function myReports(userId: number): Promise<{ id: number; targetKind: string; targetId: number; status: string; createdAt: string }[]> {
  const rows = await q`SELECT * FROM wp_reports WHERE reporter_id = ${userId} ORDER BY created_at DESC LIMIT 20`;
  return rows.map((r) => ({ id: Number(r.id), targetKind: String(r.target_kind), targetId: Number(r.target_id), status: String(r.status), createdAt: String(r.created_at) }));
}

/** Reform-card notices: what was held/removed of yours, and why (spec §1.1). */
export async function myNotices(userId: number): Promise<{ id: number; action: string; detail: string; createdAt: string }[]> {
  const rows = await q`SELECT * FROM wp_mod_log WHERE author_id = ${userId} AND action = 'block' ORDER BY created_at DESC LIMIT 10`;
  return rows.map((r) => ({ id: Number(r.id), action: String(r.action), detail: String(r.detail), createdAt: String(r.created_at) }));
}

export async function setBlock(userId: number, otherId: number, block: boolean): Promise<void> {
  const sql = await getSql();
  const lock = sql`SELECT pg_advisory_xact_lock(least(${userId}::int,${otherId}::int),greatest(${userId}::int,${otherId}::int))`;
  if (!block) {
    await sql.transaction([lock,sql`DELETE FROM wp_blocks WHERE blocker_id=${userId} AND blocked_id=${otherId}`]);
    return;
  }
  await sql.transaction([lock,
    sql`INSERT INTO wp_blocks(blocker_id,blocked_id) SELECT ${userId},id FROM wp_users WHERE id=${otherId} ON CONFLICT DO NOTHING`,
    sql`DELETE FROM wp_follows WHERE (follower_id=${userId} AND followee_id=${otherId}) OR (follower_id=${otherId} AND followee_id=${userId})`,
    sql`UPDATE wp_duo_requests r SET status='declined' FROM wp_lfg l WHERE l.id=r.listing_id AND r.status IN ('pending','accepted','held','removed')
      AND ((r.sender_id=${userId} AND l.user_id=${otherId}) OR (r.sender_id=${otherId} AND l.user_id=${userId}))`,
  ]);
}
export async function setMute(userId: number, otherId: number, mute: boolean): Promise<void> {
  if (mute) await q`INSERT INTO wp_mutes (muter_id, muted_id) VALUES (${userId}, ${otherId}) ON CONFLICT DO NOTHING`;
  else await q`DELETE FROM wp_mutes WHERE muter_id = ${userId} AND muted_id = ${otherId}`;
}

/* --------------------------- builds: patch expiry --------------------------- */

/** Author re-confirms their build for the current patch (#17). */
export async function reconfirmBuild(user: User, postId: number): Promise<{ ok: true; patch: string } | { ok: false; error: string }> {
  if (!validId(postId)) return { ok: false, error: "Build not found." };
  const patch = await confirmedPatch();
  if (!patch) return { ok: false, error: "The current patch is unavailable. Try again shortly." };
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}
    UPDATE wp_posts p SET data = p.data || jsonb_build_object('patch', $3::text)
    WHERE p.id = $2 AND p.author_id = $1 AND p.kind = 'build' AND ${visiblePostForInteraction}
    RETURNING p.id`, [user.id, postId, patch]);
  return rows.length ? { ok: true, patch } : { ok: false, error: "Only the author of a published build can re-confirm it." };
}

/* ---------------------------------- search --------------------------------- */

export async function searchAll(term: string, viewer: User | null) {
  const t = term.trim();
  const tags = t.replace(/^#/, "");
  const [users, players, rooms, tagPosts] = await Promise.all([
    t.length >= 2 ? queryRows(`WITH ${HIDDEN_AUTHORS} SELECT id, display_name, avatar_hue FROM wp_users
      WHERE safety_status = 'visible' AND id NOT IN (SELECT id FROM hidden) AND strpos(lower(display_name), lower($2)) > 0
      ORDER BY display_name, id LIMIT 8`, [viewer?.id ?? null, t]) : [],
    t.length >= 2 ? q`SELECT puuid, platform, game_name, tag_line, rank_tier, rank_div FROM wp_players
      WHERE strpos(lower(game_name), lower(${t})) > 0 ORDER BY game_name, platform, tag_line LIMIT 8` : [],
    listRooms(viewer?.id),
    tags.length >= 2 ? readPosts(viewer?.id ?? null, { tag: tags }, 50) : [],
  ]);
  const roomHits = rooms.filter(r => r.name.toLowerCase().includes(t.toLowerCase()));
  return {
    users: users.map((u) => ({ id: Number(u.id), name: String(u.display_name), hue: Number(u.avatar_hue) })),
    players: players.map((p) => ({
      puuid: String(p.puuid), platform: String(p.platform),
      riotId: `${p.game_name}#${p.tag_line}`,
      rank: rankLabel(p.rank_tier as string | null, p.rank_div as string | null),
    })),
    rooms: roomHits,
    tagPosts,
  };
}

/* ---------------------------------- admin ---------------------------------- */
