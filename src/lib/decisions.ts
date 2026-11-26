import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { publicPatch } from "./patch-notes";
import { buildCatalog } from "./build-catalog";
import { q, queryRows } from "./db";
import { ensureRooms } from "./rooms";
import { validId } from "./ids";
import { championList, confirmedPatch, getCachedPlayer } from "./riot";
import { createPost } from "./social";
import {
  decisionRoles,
  decisionTopics,
  trialOutcomes,
  type DecisionContext,
  type TrialOutcome,
} from "./decisions-input";
import type { User } from "./auth";

export async function askDecision(user: User, input: Record<string, unknown>) {
  if (
    typeof input.body !== "string" ||
    input.body.trim().length < 10 ||
    input.body.length > 1000 ||
    !decisionRoles.some((r) => r === input.role) ||
    !decisionTopics.some((t) => t === input.topic)
  ) {
    return {
      ok: false as const,
      error: "Write a question of 10–1,000 characters and choose its role and topic.",
    };
  }
  const [champions, patch] = await Promise.all([championList(), confirmedPatch()]);
  const find = (v: unknown) =>
    (typeof v === "string" &&
      champions.find(
        (c) => c.id.toLowerCase() === v.toLowerCase() || c.name.toLowerCase() === v.toLowerCase(),
      )?.id) ||
    null;
  const champion = find(input.champion),
    opponent = find(input.opponent);
  if (!champion || (input.opponent && !opponent))
    return { ok: false as const, error: "Choose champions from the catalog." };
  await ensureRooms();
  const rooms =
    await q`SELECT id FROM wp_rooms WHERE slug=${"champ-" + champion.toLowerCase()} AND safety_status='visible'`;
  if (!rooms.length)
    return { ok: false as const, error: "The champion room is unavailable. Try again shortly." };
  let itemId: number | null = null,
    itemName: string | null = null;
  if (input.itemId != null && (!validId(input.itemId) || input.puuid == null || input.matchId == null))
    return { ok: false as const, error: "Choose an item from an attached recent game." };
  let questionPatch = publicPatch(patch);
  let card: { puuid: string; matchId: string } | undefined;
  if (input.puuid != null || input.matchId != null) {
    if (
      typeof input.puuid !== "string" ||
      input.puuid.length > 120 ||
      typeof input.matchId !== "string" ||
      input.matchId.length > 70
    )
      return { ok: false as const, error: "Choose a recent game again." };
    const player = await getCachedPlayer(input.puuid);
    const match = player?.snapshot.matches.find((m) => m.matchId === input.matchId);
    if (match?.champion.toLowerCase() !== champion.toLowerCase())
      return { ok: false as const, error: "This recent match and champion must match." };
    questionPatch = publicPatch(match?.gamePatch);
    if (input.itemId != null) {
      const item = await decisionMatchItem(match?.items, input.itemId, patch ?? undefined);
      if (!item) return { ok: false as const, error: "That item is unavailable in the selected game." };
      itemId = item.id;
      itemName = item.name;
    }
    card = { puuid: input.puuid, matchId: input.matchId };
  }
  const context: DecisionContext = {
    itemId,
    itemName,
    champion,
    opponent,
    role: String(input.role),
    topic: itemId ? "Build choice" : String(input.topic),
    patch: questionPatch,
  };
  return createPost(
    user,
    {
      kind: card ? "card" : "text",
      body: input.body,
      roomId: Number(rooms[0].id),
      data: card,
      submitForReview: input.submitForReview === true,
    },
    context,
  );
}

export type DecisionFilter = {
  mode?: string;
  champion?: string;
  opponent?: string;
  role?: string;
  patch?: string;
  q?: string;
  before?: number;
  postId?: number;
};
type TrialMatch = {
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  matchId: string;
};
export type Decision = DecisionContext & {
  postId: number;
  authorId: number;
  authorName: string;
  body: string;
  answer: { id: number; authorId: number; body: string; name: string } | null;
  outcome: TrialOutcome | null;
  trialMatch: TrialMatch | null;
};
const publicAnswer = `LEFT JOIN wp_comments answer ON answer.id=d.accepted_comment_id
  AND answer.post_id=p.id AND answer.parent_id IS NULL AND answer.status='visible'
  AND answer.author_id<>p.author_id AND answer.author_id NOT IN (SELECT id FROM hidden)`;

/** Import the normal post visibility fragment and apply it before any text search, mode filter or page limit. */
export async function decisions(viewerId: number | null, f: DecisionFilter = {}): Promise<Decision[]> {
  const rows = await queryRows(
    `WITH ${HIDDEN_AUTHORS}
    SELECT p.id,p.author_id,p.body,u.display_name, d.champion,d.opponent,d.role,d.topic,d.patch,d.item_id,d.item_name,
      answer.id AS answer_id,answer.author_id AS answer_author,answer.body AS answer_body,helper.display_name AS answer_name,
      CASE WHEN answer.id IS NOT NULL THEN d.outcome END AS outcome,
      CASE WHEN answer.id IS NOT NULL THEN d.trial_match END AS trial_match
    FROM wp_decisions d JOIN wp_posts p ON p.id=d.post_id JOIN wp_users u ON u.id=p.author_id
    ${publicAnswer} LEFT JOIN wp_users helper ON helper.id=answer.author_id
    WHERE ${visiblePostForInteraction}
      AND ($2::int IS NULL OR p.id=$2) AND ($3::int IS NULL OR p.id<$3)
      AND ($4='' OR lower(d.champion)=lower($4)) AND ($5='' OR lower(d.opponent)=lower($5))
      AND ($6='' OR d.role=$6) AND ($7='' OR d.patch=$7)
      AND ($8='' OR strpos(lower(p.body),lower($8))>0 OR strpos(lower(answer.body),lower($8))>0)
      AND ($9<>'mine' OR (answer.id IS NULL AND p.author_id<>$1
        AND NOT EXISTS (SELECT 1 FROM wp_comments reply WHERE reply.post_id=p.id AND reply.parent_id IS NULL
          AND reply.status='visible' AND reply.author_id<>p.author_id AND reply.author_id NOT IN (SELECT id FROM hidden))
        AND EXISTS (
        SELECT 1 FROM wp_decision_preferences pref WHERE pref.user_id=$1 AND pref.role=d.role
          AND (pref.champion IS NULL OR pref.champion=d.champion))))
      AND ($9<>'answered' OR answer.id IS NOT NULL) AND ($9<>'unanswered' OR answer.id IS NULL)
    ORDER BY p.id DESC LIMIT 21`,
    [
      viewerId,
      f.postId ?? null,
      f.before ?? null,
      f.champion ?? "",
      f.opponent ?? "",
      f.role ?? "",
      f.patch && /^(1[5-9]|2[0-4])[.]/.test(f.patch) ? publicPatch(f.patch) : (f.patch ?? ""),
      f.q?.slice(0, 120) ?? "",
      f.mode ?? "",
    ],
  );
  return rows.map((r) => ({
    itemId: r.item_id == null ? null : Number(r.item_id),
    itemName: r.item_name as string | null,
    postId: Number(r.id),
    authorId: Number(r.author_id),
    authorName: String(r.display_name),
    body: String(r.body),
    champion: String(r.champion),
    opponent: r.opponent as string | null,
    role: String(r.role),
    topic: String(r.topic),
    patch: r.patch as string | null,
    answer: r.answer_id
      ? {
          id: Number(r.answer_id),
          authorId: Number(r.answer_author),
          body: String(r.answer_body),
          name: String(r.answer_name),
        }
      : null,
    outcome: r.outcome as TrialOutcome | null,
    trialMatch: r.trial_match as TrialMatch | null,
  }));
}

/** Only a question author may feature a currently visible first-level reply from another player. */
export async function acceptDecision(userId: number, postId: number, commentId: number) {
  if (!validId(postId) || !validId(commentId)) return false;
  const rows = await queryRows(
    `WITH ${HIDDEN_AUTHORS} UPDATE wp_decisions d SET accepted_comment_id=c.id,
    accepted_at=CASE WHEN d.accepted_comment_id=c.id THEN d.accepted_at ELSE now() END,
    outcome=CASE WHEN d.accepted_comment_id=c.id THEN d.outcome END,
    tried_at=CASE WHEN d.accepted_comment_id=c.id THEN d.tried_at END,
    trial_match=CASE WHEN d.accepted_comment_id=c.id THEN d.trial_match END
    FROM wp_posts p JOIN wp_comments c ON c.post_id=p.id WHERE p.id=$2 AND d.post_id=p.id AND p.author_id=$1
      AND c.id=$3 AND c.parent_id IS NULL AND c.status='visible' AND c.author_id<>$1
      AND c.author_id NOT IN (SELECT id FROM hidden) AND ${visiblePostForInteraction} RETURNING d.post_id`,
    [userId, postId, commentId],
  );
  return rows.length > 0;
}

/** Retain only the scoreboard explicitly chosen by its verified owner from their recent window. */
const trialGames = `SELECT m->>'matchId' AS id, jsonb_build_object('champion',m->'champion','win',m->'win',
  'kills',m->'kills','deaths',m->'deaths','assists',m->'assists','matchId',m->'matchId') AS card
  FROM wp_links l JOIN wp_players pl ON pl.puuid=l.puuid
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(pl.snapshot->'matches')='array' THEN pl.snapshot->'matches' ELSE '[]'::jsonb END) AS m
  WHERE l.user_id=$1 AND l.verified AND NOT EXISTS (SELECT 1 FROM wp_links other WHERE other.puuid=l.puuid AND other.verified AND other.user_id<>l.user_id) AND m->>'champion'=d.champion
    AND CASE WHEN (m->>'playedAt') ~ '^[0-9]{10,14}$' THEN (m->>'playedAt')::bigint > extract(epoch FROM d.accepted_at)*1000 ELSE false END
    AND jsonb_typeof(m->'win')='boolean' AND jsonb_typeof(m->'kills')='number'
    AND jsonb_typeof(m->'deaths')='number' AND jsonb_typeof(m->'assists')='number'`;

export async function trialOptions(userId: number, postId: number): Promise<TrialMatch[]> {
  const rows = await queryRows(
    `WITH ${HIDDEN_AUTHORS} SELECT DISTINCT games.id,games.card FROM wp_decisions d
    JOIN wp_posts p ON p.id=d.post_id ${publicAnswer} CROSS JOIN LATERAL (${trialGames}) games
    WHERE p.id=$2 AND p.author_id=$1 AND answer.id IS NOT NULL AND ${visiblePostForInteraction} ORDER BY games.id DESC LIMIT 20`,
    [userId, postId],
  );
  return rows.map((r) => r.card as TrialMatch);
}

export async function recordTrial(
  userId: number,
  postId: number,
  answerId: number,
  outcome: unknown,
  matchId: unknown,
) {
  if (
    !validId(postId) ||
    !validId(answerId) ||
    typeof outcome !== "string" ||
    !Object.hasOwn(trialOutcomes, outcome) ||
    (matchId != null && (typeof matchId !== "string" || !matchId || matchId.length > 70))
  )
    return false;
  const rows = await queryRows(
    `WITH ${HIDDEN_AUTHORS}, eligible AS (
    SELECT d.post_id,coalesce(g.card, CASE WHEN d.trial_match->>'matchId'=$5 THEN d.trial_match END) AS card FROM wp_decisions d JOIN wp_posts p ON p.id=d.post_id ${publicAnswer}
    LEFT JOIN LATERAL (SELECT card FROM (${trialGames}) recent WHERE recent.id=$5 LIMIT 1) g ON TRUE
    WHERE p.id=$2 AND p.author_id=$1 AND answer.id=$3 AND ${visiblePostForInteraction}
      AND ($5::text IS NULL OR g.card IS NOT NULL OR d.trial_match->>'matchId'=$5)
  ) UPDATE wp_decisions d SET outcome=$4,tried_at=coalesce(d.tried_at,now()),trial_match=e.card
    FROM eligible e WHERE e.post_id=d.post_id AND d.accepted_comment_id=$3 RETURNING d.post_id`,
    [userId, postId, answerId, outcome, matchId ?? null],
  );
  return rows.length > 0;
}

export async function decisionMatchItem(items: unknown, itemId: unknown, patch?: string) {
  if (!validId(itemId) || !Array.isArray(items) || !items.includes(itemId)) return null;
  const catalog = await buildCatalog(patch);
  const item = catalog.items.find((i) => i.id === itemId);
  return item ? { id: item.id, name: item.name } : null;
}

export type QuestionPreference = { role: string; champion: string | null };
export async function questionPreference(userId: number): Promise<QuestionPreference | null> {
  const rows = await q`SELECT role,champion FROM wp_decision_preferences WHERE user_id=${userId}`;
  return rows.length ? { role: String(rows[0].role), champion: rows[0].champion as string | null } : null;
}
export async function setQuestionPreference(userId: number, input: Record<string, unknown>) {
  if (input.clear === true) {
    await q`DELETE FROM wp_decision_preferences WHERE user_id=${userId}`;
    return true;
  }
  if (!decisionRoles.some((r) => r === input.role)) return false;
  const champion = input.champion || null;
  if (
    champion !== null &&
    (typeof champion !== "string" || !(await championList()).some((c) => c.id === champion))
  )
    return false;
  await q`INSERT INTO wp_decision_preferences(user_id,role,champion) VALUES(${userId},${input.role},${champion})
    ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,champion=excluded.champion`;
  return true;
}
