import { insertSubmission, priorSubmission, submissionHash, validSubmissionId, type SubmissionResult } from "./submissions";
import { allMentionsVisible, readMentionBody, unavailableMention } from "./player-mentions";
import { matchRegion } from "./match-context";
import { publicQueueSql } from "./public-match-queues";
import { plainBodyText } from "./game-tags";
import { includesRoomLink, roomWriteError } from "./room-safety";
import { inProbation } from "./account-policy";
import { validId } from "./ids";
import { publicAvatar } from "./avatar";
import type { DecisionContext } from "./decisions-input";
import { preparePost, scoreSubmission, type CreatePostInput } from "./post-input";
export type { CreatePostInput } from "./post-input";
import type { SearchScope } from "./search-scopes";
import type { PlatformId } from "./platforms";
import { placedRank, readRankedEntries, socialRankLabel } from "./player-summary";
import { HIDDEN_AUTHORS, visibleCommentsFor, visiblePostForInteraction } from "./community-queries";
import { quoteSourceVisible } from "./quote-queries";
import { PATCH_PUBLISHER } from "./patch-notes";
import { readPosts, readComments } from "./post-reader";
import type { PostView, CommentView } from "./post-types";
export type { PostView, CommentView } from "./post-types";

import { getSql, q, queryRows } from "./db";
import { screenText } from "./managed-text-screen";
import { scoreContent, bodyFingerprint, publishOutcome } from "./moderation";
import { rateLimit, type User } from "./auth";
import { confirmedPatch } from "./riot";
import { buildCatalog } from "./build-catalog";
import { buildKeystone, verifyBuildLoadout } from "./build-sharing";
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

export async function createPost(user: User, input: CreatePostInput, decision?: DecisionContext, decisionHash?: string,
  checkedMatch?: import("./post-input").CheckedMatchForPost, quotedPostId?: number): Promise<CreateResult> {
  const key = input.submissionId ?? null;
  if (key !== null && !validSubmissionId(key)) return badKey;
  const hash = key ? decisionHash ?? submissionHash([input.kind,input.body,input.roomId ?? null,input.data ?? null,decision ?? null]) : null;
  const replay = await priorSubmission("post",user.id,key,hash);
  if (replay) return replay;
  if (!(await rateLimit(user.id, "post", 30, 60))) return { ok: false, error: "You're posting too fast — take a breath and try again in a bit." };
  const draft = await preparePost(input, user.id, checkedMatch);
  if (!draft.ok) return draft;
  const { body, data, roomId } = draft;
  const mentions = readMentionBody(body);
  if (!mentions.ok) return mentions;
  const fields = [mentions.text, ...draft.fields.slice(1)];
  const lowTrust = inProbation(user.createdAt);
  const mod = await screenText(scoreSubmission(fields, lowTrust, mentions.contactText), fields, user.id, "post");
  if (mod.action === "block") {
    await q`INSERT INTO wp_mod_log (target_kind, author_id, score, action, detail)
            VALUES ('post', ${user.id}, ${mod.score}, 'block', ${mod.hits.join(",")})`;
    return { ok: false, error: "That post can't be published — it trips our community safety filter. If you think this is a mistake, rephrase and try again." };
  }
  const outcome = publishOutcome(mod, { lowTrust });
  if (outcome === "hold" && !input.submitForReview && !mod.hits.includes("screening-unavailable")) {
    return { ok: false, reconsider: true, error: "This wording may break the community guidelines. Edit your draft or submit it for a moderator to review." };
  }
  // Duplicate spam: identical body three times in an hour -> hold.
  let status: "visible" | "held" = outcome === "hold" ? "held" : "visible";
  // A provider link is never published automatically.
  if (input.kind === "clip") status = "held";
  if (status === "visible" && body.length > 0) {
    const fp = bodyFingerprint(mentions.text);
    const recent = await q`SELECT body FROM wp_posts WHERE author_id = ${user.id} AND created_at > now() - interval '1 hour'`;
    if (recent.filter((r) => bodyFingerprint(plainBodyText(String(r.body))) === fp).length >= 2) status = "held";
  }
  // Borderline work from an established account is already public at this
  // point; flag it for the reviewer sweep instead of holding it.
  const flagged = outcome === "publish-flagged" && status === "visible";

  let rows;
  try {
    const sql = await getSql();
    rows = await insertSubmission(sql, sql(`WITH ${HIDDEN_AUTHORS}, mention_gate AS MATERIALIZED (SELECT ${allMentionsVisible("$25")} AS allowed), original AS MATERIALIZED (
    SELECT p.id,p.author_id FROM wp_posts p WHERE p.id=$21::int AND p.room_id IS NOT DISTINCT FROM $4::int
      AND $1 NOT IN (SELECT id FROM hidden) AND ${quoteSourceVisible("$20")}
  ), inserted AS (
    INSERT INTO wp_posts (author_id, kind, body, room_id, data, status, clip_review_required, card_validated, submission_id, submission_hash)
    SELECT $1,$2,$3,$4::int,$5::jsonb,$6,$7,$8,$9::uuid,$10
    WHERE CASE WHEN EXISTS(SELECT 1 FROM wp_posts WHERE author_id=$1 AND submission_id=$9::uuid)
      OR NOT (SELECT allowed FROM mention_gate) OR ($21::int IS NOT NULL AND NOT EXISTS (SELECT 1 FROM original))
      THEN false ELSE wp_reserve_room_turn($4::int,$1,$11) END
    ON CONFLICT (author_id,submission_id) WHERE submission_id IS NOT NULL DO NOTHING
    RETURNING id
  ), question AS (
    INSERT INTO wp_decisions (post_id,champion,opponent,role,topic,patch,item_id,item_name)
    SELECT id,$13::text,$14::text,$15::text,$16::text,$17::text,$18::int,$19::text FROM inserted WHERE $12
  ), quote AS (
    INSERT INTO wp_quote_posts(post_id,original_post_id,original_author_id)
    SELECT inserted.id,original.id,original.author_id FROM inserted CROSS JOIN original
  ), audit AS (
    INSERT INTO wp_mod_log (target_kind, target_id, author_id, score, action, detail)
    SELECT 'post',id,$1,$22,CASE WHEN $6='held' THEN 'hold' ELSE 'flag' END,$23 FROM inserted WHERE $6='held' OR $24
  ) SELECT id FROM inserted UNION ALL SELECT NULL AS id FROM mention_gate WHERE NOT allowed`, [user.id,input.kind,body,roomId,JSON.stringify(data),status,input.kind === "clip",input.kind === "card",key,hash,
    input.kind === "clip" || includesRoomLink(fields),!!decision,decision?.champion ?? null,decision?.opponent ?? null,decision?.role ?? null,
    decision?.topic ?? null,decision?.patch ?? null,decision?.itemId ?? null,decision?.itemName ?? null,PATCH_PUBLISHER,quotedPostId ?? null,
    mod.score,mod.hits.join(","),flagged,JSON.stringify(mentions.targets)]),key,user.id);
  } catch(error) { return await priorSubmission("post",user.id,key,hash) ?? {ok:false,error:roomWriteError(error)}; }
  if (rows[0]?.id === null) return {ok:false,error:unavailableMention};
  if (!rows.length) return await priorSubmission("post",user.id,key,hash) ?? { ok: false,
    error: quotedPostId ? "The original post is unavailable to quote." : "That room is unavailable." };
  const postId = Number(rows[0].id);
  return { ok: true, postId, status };
}

export function feed(viewer: User | null, tab: "following" | "everyone", roomId?: number, limit = 30): Promise<PostView[]> {
  return readPosts(viewer?.id ?? null, { roomId, activeReplies: !roomId && tab === "everyone", following: !roomId && !!viewer && tab === "following" }, limit);
}

export function feedByAuthor(authorId: number, viewer: User | null, limit = 20): Promise<PostView[]> {
  return readPosts(viewer?.id ?? null, { authorId }, limit);
}

export function buildFeed(viewer: User | null, filters: { champion?: string; item?: number; offMeta?: boolean }, limit = 100): Promise<PostView[]> {
  return readPosts(viewer?.id ?? null, { builds: filters }, limit);
}

export async function getPost(postId: number, viewer: User | null): Promise<PostView | null> {
  if (!validId(postId)) return null;
  const [post] = await readPosts(viewer?.id ?? null, { postId }, 1);
  return post ?? null;
}

export async function castPollVote(user: User, postId: number, optionIdx: number): Promise<"recorded" | "closed" | "unavailable"> {
  if (!validId(postId) || !Number.isInteger(optionIdx) || optionIdx < 0 || optionIdx > 3) return "unavailable";
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}, eligible AS MATERIALIZED (
    SELECT p.id,d.opens_at,d.closes_at,d.tally FROM wp_posts p LEFT JOIN wp_daily_calls d ON d.post_id=p.id
    WHERE p.id = $2 AND p.kind = 'poll' AND ${visiblePostForInteraction}
      AND CASE WHEN jsonb_typeof(p.data->'options') = 'array' THEN
        jsonb_array_length(p.data->'options') BETWEEN 2 AND 4
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.data->'options') v(option)
          WHERE jsonb_typeof(v.option) <> 'string' OR length(v.option #>> '{}') NOT BETWEEN 1 AND 60)
        AND $3 < jsonb_array_length(p.data->'options')
        ELSE FALSE END
  ), recorded AS (
    INSERT INTO wp_poll_votes (post_id, user_id, option_idx)
    SELECT id,$1,$3::int FROM eligible WHERE closes_at IS NULL
      OR (tally IS NULL AND opens_at<=clock_timestamp() AND closes_at>clock_timestamp())
    ON CONFLICT (post_id, user_id) DO UPDATE SET option_idx = EXCLUDED.option_idx RETURNING post_id
  ) SELECT CASE WHEN EXISTS (SELECT 1 FROM recorded) THEN 'recorded'
    WHEN EXISTS (SELECT 1 FROM eligible WHERE tally IS NOT NULL OR closes_at<=clock_timestamp()) THEN 'closed'
    ELSE 'unavailable' END AS result`,
  [user.id, postId, optionIdx]);
  const result = rows[0]?.result;
  return result === "recorded" || result === "closed" ? result : "unavailable";
}

export async function votePoll(user: User, postId: number, optionIdx: number): Promise<boolean> {
  return await castPollVote(user, postId, optionIdx) === "recorded";
}

/* --------------------------------- comments -------------------------------- */

export async function listComments(postId: number, viewer: User | null): Promise<CommentView[]> {
  if (!validId(postId)) return [];
  return readComments(postId, viewer?.id ?? null);
}

export async function addComment(user: User, postId: number, bodyRaw: string, parentId?: number, oneFix = false, submitForReview = false, key: string | null = null, matchRef: string | null = null): Promise<CreateResult> {
  if (!validId(postId) || (parentId != null && !validId(parentId))) return { ok: false, error: "Conversation unavailable." };
  const body = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
  if (body.length < 1 || body.length > 1000) return { ok: false, error: "Comments are 1–1000 characters." };
  if (matchRef !== null && !matchRegion(matchRef)) return { ok: false, error: "Choose the public match attached to this thread." };
  if (oneFix && parentId != null) return { ok: false, error: "Start a new One Fix directly on the game card." };
  if (key !== null && !validSubmissionId(key)) return badKey;
  const hash = key ? submissionHash([postId,body,parentId ?? null,oneFix,...(matchRef ? [matchRef] : [])]) : null;
  const replay = await priorSubmission("comment",user.id,key,hash);
  if (replay) return replay;
  if (!(await rateLimit(user.id, "comment", 60, 60))) return { ok: false, error: "You're commenting too fast — slow down a little." };
  const lowTrust = inProbation(user.createdAt);
  const mentions = readMentionBody(body);
  if (!mentions.ok) return mentions;
  const mod = await screenText(scoreContent(mentions.text, { lowTrust, contactText: mentions.contactText }), [mentions.text], user.id, "comment");
  if (mod.action === "block") {
    await q`INSERT INTO wp_mod_log (target_kind, author_id, score, action, detail) VALUES ('comment', ${user.id}, ${mod.score}, 'block', ${mod.hits.join(",")})`;
    return { ok: false, error: "That comment can't be published — it trips our community safety filter." };
  }
  const outcome = publishOutcome(mod, { lowTrust });
  if (outcome === "hold" && !submitForReview && !mod.hits.includes("screening-unavailable")) {
    return { ok: false, reconsider: true, error: "This reply may break the guidelines. Edit it or submit for moderator review." };
  }
  const status = outcome === "hold" ? "held" : "visible";
  // Borderline replies from established accounts publish flagged for the
  // reviewer sweep, exactly like posts (moderation-automation spec).
  const flagged = outcome === "publish-flagged";
  let rows;
  try {
    const sql = await getSql();
    rows = await insertSubmission(sql,sql(`WITH RECURSIVE ${HIDDEN_AUTHORS}, mention_gate AS MATERIALIZED (SELECT ${allMentionsVisible("$13")} AS allowed), candidate_replies AS (
    SELECT id FROM wp_comments WHERE id=$3::int AND post_id=$2
  ), ${visibleCommentsFor("candidateReplies")}, candidate AS MATERIALIZED (
    SELECT p.id,p.room_id FROM wp_posts p WHERE p.id=$2 AND ${visiblePostForInteraction} AND (NOT $6 OR p.kind='card')
      AND ($14::text IS NULL OR (p.kind='card' AND p.card_validated
        AND p.data#>>'{matchContext,matchId}'=$14 AND ${publicQueueSql("(p.data->'matchContext')")}))
      AND NOT p.replies_closed AND ($3::int IS NULL OR EXISTS (SELECT 1 FROM thread)) FOR SHARE OF p
  ), submitted AS (
    INSERT INTO wp_comments(post_id,author_id,parent_id,body,status,one_fix,submission_id,submission_hash,match_ref)
    SELECT id,$1,$3::int,$4,$5,$6::boolean,$10::uuid,$11,$14 FROM candidate
    WHERE CASE WHEN EXISTS(SELECT 1 FROM wp_comments WHERE author_id=$1 AND submission_id=$10::uuid)
      OR NOT (SELECT allowed FROM mention_gate) THEN false ELSE wp_reserve_room_turn(room_id,$1,$9) END
    ON CONFLICT (author_id,submission_id) WHERE submission_id IS NOT NULL DO NOTHING
    RETURNING id
  ), hold_log AS (
    INSERT INTO wp_mod_log (target_kind, target_id, author_id, score, action, detail)
    SELECT 'comment', id, $1, $7, CASE WHEN $5='held' THEN 'hold' ELSE 'flag' END, $8 FROM submitted WHERE $5 = 'held' OR $12
  ) SELECT id FROM submitted UNION ALL SELECT NULL AS id FROM mention_gate WHERE NOT allowed`,
  [user.id, postId, parentId ?? null, body, status, oneFix, mod.score, mod.hits.join(","),includesRoomLink([mentions.text]),key,hash,flagged,JSON.stringify(mentions.targets),matchRef]),key,user.id);
  } catch(error) { return await priorSubmission("comment",user.id,key,hash) ?? {ok:false,error:roomWriteError(error)}; }
  if (rows[0]?.id === null) return {ok:false,error:unavailableMention};
  if (!rows.length) return await priorSubmission("comment",user.id,key,hash) ?? { ok: false, error: oneFix ? "One Fix needs an available game card." : "Replies are closed or this conversation is unavailable." };
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
  // End any legacy connections before removing a block. A no-op unblock must leave connections alone.
  const closeConnections = [
    sql`DELETE FROM wp_follows WHERE ((follower_id=${userId} AND followee_id=${otherId}) OR (follower_id=${otherId} AND followee_id=${userId}))
      AND EXISTS (SELECT 1 FROM wp_blocks WHERE blocker_id=${userId} AND blocked_id=${otherId})`,
    sql`DELETE FROM wp_duo_shortlist WHERE (owner_id,player_id) IN ((${userId},${otherId}),(${otherId},${userId}))
      AND EXISTS (SELECT 1 FROM wp_blocks WHERE blocker_id=${userId} AND blocked_id=${otherId})`,
    sql`UPDATE wp_duo_requests r SET status='declined' FROM wp_lfg l WHERE l.id=r.listing_id AND r.status IN ('pending','accepted','held','removed')
      AND ((r.sender_id=${userId} AND l.user_id=${otherId}) OR (r.sender_id=${otherId} AND l.user_id=${userId}))
      AND EXISTS (SELECT 1 FROM wp_blocks WHERE blocker_id=${userId} AND blocked_id=${otherId})`,
  ];
  if (block) {
    await sql.transaction([lock,
      sql`INSERT INTO wp_blocks(blocker_id,blocked_id) SELECT ${userId},id FROM wp_users WHERE id=${otherId} ON CONFLICT DO NOTHING`,
      ...closeConnections,
    ]);
  } else {
    await sql.transaction([lock, ...closeConnections,
      sql`DELETE FROM wp_blocks WHERE blocker_id=${userId} AND blocked_id=${otherId}`,
    ]);
  }
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
  const [catalog, source] = await Promise.all([buildCatalog(patch), queryRows(`WITH ${HIDDEN_AUTHORS}
    SELECT p.data FROM wp_posts p WHERE p.id = $2 AND p.author_id = $1 AND p.kind = 'build' AND ${visiblePostForInteraction}`,
    [user.id, postId])]);
  const prior = source[0]?.data as Record<string, unknown> | undefined;
  if (!prior) return { ok: false, error: "Only the author of a published build can re-confirm it." };
  if (catalog.patch !== patch) return { ok: false, error: "The current item and rune catalog is unavailable. Try again shortly." };
  const keystone = prior.keystone == null ? null : buildKeystone(prior.keystone);
  const loadout = prior.keystone == null || keystone ? verifyBuildLoadout(catalog, prior.items, keystone?.id) : null;
  if (!loadout) return { ok: false, error: "This build includes items or a keystone that are unavailable on the current patch. Share an updated build instead." };
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}
    UPDATE wp_posts p SET data = p.data || $3::jsonb
    WHERE p.id = $2 AND p.author_id = $1 AND p.kind = 'build' AND p.data = $4::jsonb AND ${visiblePostForInteraction}
    RETURNING p.id`, [user.id, postId, JSON.stringify({ patch, ...(loadout.keystone && { keystone: loadout.keystone }) }), JSON.stringify(prior)]);
  return rows.length ? { ok: true, patch } : { ok: false, error: "This build changed. Reload it before re-confirming." };
}

/* ---------------------------------- search --------------------------------- */

export async function searchAll(term: string, viewer: User | null, scope: SearchScope = "all", platform?: PlatformId) {
  const t = term.trim().slice(0, 80);
  const tag = t.startsWith("#") ? t.slice(1) : null;
  const includes = (section: SearchScope) => scope === "all" || scope === section;
  const limit = scope === "all" ? 8 : 24;
  const [users, players, rooms, posts] = await Promise.all([
    includes("people") && t.length >= 2 ? queryRows(`WITH ${HIDDEN_AUTHORS} SELECT id, display_name, avatar_hue, avatar_ref FROM wp_users
      WHERE safety_status = 'visible' AND id NOT IN (SELECT id FROM hidden) AND strpos(lower(display_name), lower($2)) > 0
      ORDER BY display_name, id LIMIT $3`, [viewer?.id ?? null, t, limit]) : [],
    includes("players") && t.length >= 2 && tag === null ? queryRows(`WITH ${HIDDEN_AUTHORS}, matches AS (
      SELECT DISTINCT ON (platform,lower(game_name),lower(tag_line)) puuid,platform,game_name,tag_line,rank_tier,
        rank_div,fetched_at,snapshot->'rankedEntries' AS ranked_entries FROM wp_players
      WHERE strpos(lower(game_name || '#' || tag_line),lower($2)) > 0 AND ($3::text IS NULL OR platform=$3)
      ORDER BY platform,lower(game_name),lower(tag_line),fetched_at DESC,puuid
    ) SELECT platform,game_name,tag_line,rank_tier,rank_div,fetched_at,ranked_entries FROM matches p
      WHERE NOT EXISTS(SELECT 1 FROM wp_links l WHERE l.puuid=p.puuid AND l.verified AND l.user_id IN (SELECT id FROM hidden))
      ORDER BY (lower(game_name || '#' || tag_line)=lower($2)) DESC,game_name,platform,tag_line LIMIT $4`,
      [viewer?.id ?? null,t,platform ?? null,limit]) : [],
    includes("rooms") && t ? listRooms(viewer?.id, limit, t) : [],
    (includes("posts") || scope === "builds") && (tag ?? t).length >= 2
      ? readPosts(viewer?.id ?? null, { ...(tag === null ? { text: t } : { tag }),
          ...(scope === "builds" ? { kind: "build" } : {}) }, limit) : [],
  ]);
  return {
    users: users.map(u => ({ id: Number(u.id), name: String(u.display_name), hue: Number(u.avatar_hue), avatar: publicAvatar(u.avatar_ref) })),
    players: players.map(p => {
      const fields = {rankTier: p.rank_tier as string | null, rankDiv: p.rank_div as string | null,
        rankedEntries: readRankedEntries(p.ranked_entries), fetchedAt: String(p.fetched_at)};
      return {platform: String(p.platform), riotId: `${p.game_name}#${p.tag_line}`, rank: socialRankLabel(fields), tier: placedRank(fields).tier};
    }),
    rooms,
    posts,
  };
}

/* ---------------------------------- admin ---------------------------------- */
