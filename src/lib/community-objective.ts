import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { queryRows } from "./db";
import { REACTION_EMOJIS } from "./pure";
import { PATCH_PUBLISHER } from "./patch-notes";

const goals = [
  { kind: "cards", label: "Share recent game cards", target: 3, href: "/player", action: "Look up a game to share" },
  { kind: "builds", label: "Share a champion build", target: 3, href: "/#compose", action: "Open the composer and choose Build" },
  { kind: "fixes", label: "Give a player one fix to try", target: 3, href: "/", action: "Review a game card" },
  { kind: "questions", label: "Ask a match question", target: 3, href: "/questions/new", action: "Ask a question" },
  { kind: "reactions", label: "React to a community post", target: 5, href: "/", action: "Open a discussion" },
] as const;

export function objectiveDay(now: Date) {
  const day = Math.floor(now.getTime() / 86_400_000);
  return {
    goal: goals[((day % goals.length) + goals.length) % goals.length],
    start: new Date(day * 86_400_000).toISOString(),
    end: new Date((day + 1) * 86_400_000).toISOString(),
  };
}

const sources = `WITH ${HIDDEN_AUTHORS}, people AS NOT MATERIALIZED (
  SELECT id FROM wp_users WHERE safety_status='visible' AND (banned_until IS NULL OR banned_until<=now())
    AND id NOT IN (SELECT id FROM hidden) AND email<>$4
), posts AS NOT MATERIALIZED (
  SELECT p.id,p.author_id,p.kind,p.card_validated,p.created_at FROM wp_posts p
  JOIN people author ON author.id=p.author_id WHERE ${visiblePostForInteraction}
)`;

const fromToday = (alias: "p" | "c" | "r") =>
  `${alias}.created_at >= $2::timestamptz AND ${alias}.created_at < $3::timestamptz`;

const contributions = {
  cards: `SELECT p.author_id FROM posts p WHERE p.kind='card' AND p.card_validated AND ${fromToday("p")}`,
  builds: `SELECT p.author_id FROM posts p WHERE p.kind='build' AND ${fromToday("p")}`,
  questions: `SELECT p.author_id FROM posts p JOIN wp_decisions d ON d.post_id=p.id WHERE ${fromToday("p")}`,
  fixes: `SELECT c.author_id FROM wp_comments c JOIN posts p ON p.id=c.post_id
    JOIN people helper ON helper.id=c.author_id
    WHERE c.status='visible' AND c.one_fix AND c.parent_id IS NULL AND p.kind='card' AND p.card_validated
      AND c.author_id<>p.author_id AND ${fromToday("c")}`,
  reactions: `SELECT r.user_id AS author_id FROM wp_reactions r JOIN posts p ON p.id=r.target_id
    JOIN people contributor ON contributor.id=r.user_id
    WHERE r.target_kind='post' AND r.emoji=ANY($5::text[]) AND r.user_id<>p.author_id AND ${fromToday("r")}`,
};

function cappedParticipants(kind: keyof typeof contributions, target: number) {
  return `(SELECT count(*)::int FROM (SELECT DISTINCT author_id FROM (${contributions[kind]}) events LIMIT ${target}) participating)`;
}

export async function readCommunityObjective(viewerId: number | null, now = new Date()) {
  const { goal, start, end } = objectiveDay(now);
  const progress = cappedParticipants(goal.kind, goal.target);
  const needsPost = goal.kind === "fixes" || goal.kind === "reactions";
  const fallback = goals[3];
  // Only the day's action runs. On a peer-interaction day, switch to an open action if the viewer
  // has no eligible target. CASE leaves the unused progress branch unexecuted in PostgreSQL.
  const statement = needsPost
    ? `${sources}, target AS MATERIALIZED (
        SELECT p.id FROM posts p WHERE p.author_id IS DISTINCT FROM $1
          ${goal.kind === "fixes" ? "AND p.kind='card' AND p.card_validated" : ""}
        ORDER BY p.created_at DESC,p.id DESC LIMIT 1)
      SELECT (SELECT id FROM target) AS target_id, CASE WHEN EXISTS (SELECT 1 FROM target)
        THEN ${progress} ELSE ${cappedParticipants(fallback.kind, fallback.target)} END AS count`
    : `${sources} SELECT ${progress} AS count`;
  const values: unknown[] = [viewerId, start, end, PATCH_PUBLISHER];
  if (goal.kind === "reactions") values.push(REACTION_EMOJIS);
  const [row] = await queryRows(statement, values);
  const chosen = needsPost && row.target_id == null ? fallback : goal;
  return { ...chosen, count: Number(row.count), href: row.target_id == null ? chosen.href : `/post/${Number(row.target_id)}` };
}
