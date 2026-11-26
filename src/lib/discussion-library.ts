import { HIDDEN_AUTHORS, visibleCommentsFor, visiblePostForInteraction } from "./community-queries";
import { queryRows } from "./db";

export type LibraryKind = "post" | "comment";
export type LibraryAction = "save" | "watch" | "mute" | "read";
export type ReplyMode = "all" | "direct" | "muted";

function eligibleTarget(kind: LibraryKind) {
  if (kind === "comment") {
    return `WITH RECURSIVE ${HIDDEN_AUTHORS}, ${visibleCommentsFor("comment")}, target AS (SELECT id FROM thread)`;
  }
  return `WITH ${HIDDEN_AUTHORS}, target AS (
    SELECT p.id FROM wp_posts p WHERE p.id=$2 AND ${visiblePostForInteraction})`;
}

export async function libraryState(userId: number, kind: LibraryKind, id: number) {
  const column = kind === "post" ? "post_id" : "comment_id";
  const rows = await queryRows(`${eligibleTarget(kind)}
    SELECT EXISTS(SELECT 1 FROM wp_discussion_saves WHERE user_id=$1 AND ${column}=target.id) AS saved,
      ${kind === "post" ? "coalesce((SELECT reply_mode FROM wp_thread_watches WHERE user_id=$1 AND post_id=target.id),'direct')" : "'direct'"} AS reply_mode
    FROM target`, [userId, id]);
  return rows.length ? { saved: rows[0].saved === true, watching: rows[0].reply_mode === "all", replyMode: rows[0].reply_mode as ReplyMode } : null;
}

// Compute activity from replies at read time. Held/removed items, hidden ancestors,
// muted or blocked users and closed rooms disappear even after someone read the notice.
const activityCtes = `WITH RECURSIVE ${HIDDEN_AUTHORS},
  addressed AS (
    SELECT c.id, c.post_id, c.created_at, 'post' AS reason FROM wp_posts p JOIN wp_comments c ON c.post_id=p.id
    WHERE p.author_id=$1 AND p.status='visible' AND c.parent_id IS NULL AND c.author_id<>$1 AND c.status='visible'
    UNION ALL
    SELECT c.id, c.post_id, c.created_at, 'comment' AS reason FROM wp_comments mine JOIN wp_comments c ON c.parent_id=mine.id AND c.post_id=mine.post_id
    WHERE mine.author_id=$1 AND mine.status='visible' AND c.author_id<>$1 AND c.status='visible'
  ), candidate_replies AS (
    SELECT d.id,d.reason FROM addressed d LEFT JOIN wp_thread_watches w ON w.user_id=$1 AND w.post_id=d.post_id
    WHERE w.reply_mode IS DISTINCT FROM 'muted' AND (w.direct_since IS NULL OR d.created_at>=w.direct_since)
    UNION ALL
    SELECT c.id,'watch' FROM wp_thread_watches w JOIN wp_comments c ON c.post_id=w.post_id
    WHERE w.user_id=$1 AND w.reply_mode='all' AND c.created_at>=w.started_at AND c.author_id<>$1 AND c.status='visible'
  ), ${visibleCommentsFor("candidateReplies")},
  notices AS (SELECT c.id,c.post_id,c.author_id,c.body,c.created_at,selected.reason FROM thread t
    JOIN wp_comments c ON c.id=t.id JOIN (
      SELECT id,coalesce(max(nullif(reason,'watch')),'watch') AS reason FROM candidate_replies GROUP BY id
    ) selected ON selected.id=t.id)`;

export async function setReplyMode(userId: number, id: number, mode: ReplyMode) {
  const rows = await queryRows(`${eligibleTarget("post")}, changed AS (
      INSERT INTO wp_thread_watches(user_id,post_id,reply_mode) SELECT $1,id,$3 FROM target
      ON CONFLICT(user_id,post_id) DO UPDATE SET reply_mode=excluded.reply_mode,started_at=now(),
        direct_since=CASE WHEN wp_thread_watches.reply_mode='muted' THEN now() ELSE wp_thread_watches.direct_since END
      WHERE wp_thread_watches.reply_mode<>excluded.reply_mode)
    SELECT 1 FROM target`, [userId, id, mode]);
  return rows.length > 0;
}

export async function changeLibrary(userId: number, kind: LibraryKind, id: number, action: LibraryAction, active: boolean) {
  if (action === "read") {
    if (kind !== "comment" || !active) return false;
    const rows = await queryRows(`${activityCtes}, seen AS (
      INSERT INTO wp_discussion_read_replies(user_id,comment_id)
      SELECT $1,id FROM notices WHERE id=$2 ON CONFLICT DO NOTHING)
      SELECT 1 FROM notices WHERE id=$2`, [userId, id]);
    return rows.length > 0;
  }
  if (action === "watch" || action === "mute") {
    if (kind !== "post") return false;
    const mode: ReplyMode = action === "watch" ? "all" : "muted";
    if (!active) {
      // Resume direct notifications from now when unmuting. An unwatch only ends all-reply delivery.
      await queryRows(`UPDATE wp_thread_watches SET reply_mode='direct',
          direct_since=CASE WHEN reply_mode='muted' THEN now() ELSE direct_since END
        WHERE user_id=$1 AND post_id=$2 AND reply_mode=$3`, [userId, id, mode]);
      return true;
    }
    return setReplyMode(userId, id, mode);
  }
  const column = kind === "post" ? "post_id" : "comment_id";
  if (!active) {
    // A user can always discard their own reference, including after a moderation hold.
    await queryRows(`DELETE FROM wp_discussion_saves WHERE user_id=$1 AND ${column}=$2`, [userId, id]);
    return true;
  }
  const rows = await queryRows(`${eligibleTarget(kind)}, saved AS (
    INSERT INTO wp_discussion_saves(user_id,${column}) SELECT $1,id FROM target ON CONFLICT DO NOTHING)
    SELECT 1 FROM target`, [userId, id]);
  return rows.length > 0;
}

export const LIBRARY_PAGE_SIZE = 25;
export type LibraryEntry = { kind: LibraryKind; id: number; postId: number; authorId: number; author: string; excerpt: string; cursor: string; unread: boolean; replyReason?: "post" | "comment" | "watch" };

function entries(rows: Record<string, unknown>[]) {
  const page: LibraryEntry[] = rows.slice(0, LIBRARY_PAGE_SIZE).map(row => ({
    kind: row.kind === "comment" ? "comment" : "post", id: Number(row.id), postId: Number(row.post_id),
    authorId: Number(row.author_id), author: String(row.author), excerpt: String(row.excerpt || "Open discussion"), cursor: String(row.cursor),
    unread: row.unread === true,
    replyReason: row.reason as LibraryEntry["replyReason"],
  }));
  return { entries: page, next: rows.length > LIBRARY_PAGE_SIZE ? page[page.length - 1].cursor : null };
}

export type LibraryPage = ReturnType<typeof entries>;
export function pageCursor(value: unknown) {
  return typeof value === "string" && /^[1-9]\d{0,17}$/.test(value) ? value : null;
}

export async function savedPlaybook(userId: number, before: string | null, kind?: LibraryKind) {
  const rows = await queryRows(`WITH RECURSIVE ${HIDDEN_AUTHORS},
    saves AS (SELECT s.id AS cursor, s.comment_id,coalesce(s.post_id,c.post_id) AS post_id
      FROM wp_discussion_saves s LEFT JOIN wp_comments c ON c.id=s.comment_id
      WHERE s.user_id=$1 AND ($2::bigint IS NULL OR s.id < $2)
        AND ($4::text IS NULL OR ($4='comment' AND s.comment_id IS NOT NULL) OR ($4='post' AND s.post_id IS NOT NULL))),
    candidates AS (SELECT DISTINCT post_id FROM saves WHERE comment_id IS NOT NULL),
    ${visibleCommentsFor("posts", "candidates")}
    SELECT s.cursor,coalesce(c.id,p.id) AS id,p.id AS post_id,u.id AS author_id,u.display_name AS author,
      CASE WHEN c.id IS NULL THEN 'post' ELSE 'comment' END AS kind, left(coalesce(c.body,nullif(p.body,''),p.kind || ' post'),220) AS excerpt
    FROM saves s JOIN wp_posts p ON p.id=s.post_id LEFT JOIN wp_comments c ON c.id=s.comment_id
    JOIN wp_users u ON u.id=coalesce(c.author_id,p.author_id)
    WHERE ${visiblePostForInteraction} AND (c.id IS NULL OR EXISTS(SELECT 1 FROM thread t WHERE t.id=c.id))
    ORDER BY s.cursor DESC LIMIT $3`, [userId, before, LIBRARY_PAGE_SIZE + 1, kind ?? null]);
  return entries(rows);
}

export async function hasUnreadReplies(userId: number) {
  const rows = await queryRows(`${activityCtes}
    SELECT 1 FROM notices n WHERE NOT EXISTS (
      SELECT 1 FROM wp_discussion_read_replies r WHERE r.user_id=$1 AND r.comment_id=n.id
    ) LIMIT 1`, [userId]);
  return rows.length > 0;
}

export async function replyActivity(userId: number, before: string | null) {
  const rows = await queryRows(`${activityCtes}
    SELECT n.id AS cursor,n.id,n.post_id,'comment' AS kind,n.reason,u.id AS author_id,u.display_name AS author,left(n.body,220) AS excerpt,
      r.comment_id IS NULL AS unread FROM notices n JOIN wp_users u ON u.id=n.author_id
    LEFT JOIN wp_discussion_read_replies r ON r.user_id=$1 AND r.comment_id=n.id
    WHERE ($2::bigint IS NULL OR n.id < $2) ORDER BY n.id DESC LIMIT $3`, [userId, before, LIBRARY_PAGE_SIZE + 1]);
  return entries(rows);
}

export async function watchedDiscussions(userId: number, before: string | null, mode: "all" | "muted" = "all") {
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS} SELECT p.id AS cursor,p.id,p.id AS post_id,'post' AS kind,
    u.id AS author_id,u.display_name AS author,left(coalesce(nullif(p.body,''),p.kind || ' post'),220) AS excerpt
    FROM wp_thread_watches w JOIN wp_posts p ON p.id=w.post_id JOIN wp_users u ON u.id=p.author_id
    WHERE w.user_id=$1 AND w.reply_mode=$4 AND ($2::bigint IS NULL OR p.id < $2) AND ${visiblePostForInteraction}
    ORDER BY p.id DESC LIMIT $3`, [userId, before, LIBRARY_PAGE_SIZE + 1, mode]);
  return entries(rows);
}

export async function publicDiscussion(id: number, viewerId: number | null = null) {
  // Unfurlers are anonymous. Signed-in viewers also retain their block and mute filters.
  const [row] = await queryRows(`WITH ${HIDDEN_AUTHORS}
    SELECT p.kind, r.name AS room, left(p.body,160) AS body, d.champion, d.role,
      CASE WHEN p.kind='card' AND p.card_validated THEN jsonb_build_array(
        p.data#>'{match,champion}', p.data#>'{match,win}', p.data#>'{match,kills}',
        p.data#>'{match,deaths}', p.data#>'{match,assists}') END AS scoreboard
    FROM wp_posts p LEFT JOIN wp_rooms r ON r.id=p.room_id
    LEFT JOIN wp_decisions d ON d.post_id=p.id
    WHERE p.id=$2 AND ${visiblePostForInteraction}`, [viewerId, id]);
  if (!row) return null;
  const score = row.scoreboard;
  let match: string | null = null;
  if (Array.isArray(score) && score.length === 5 && typeof score[0] === "string" &&
      /^[A-Za-z0-9]{1,64}$/.test(score[0]) && typeof score[1] === "boolean" &&
      score.slice(2).every(value => Number.isSafeInteger(value) && value >= 0 && value < 10000)) {
    match = `${score[0]} · ${score[1] ? "Victory" : "Defeat"} · ${score[2]}/${score[3]}/${score[4]} KDA`;
  }
  return {
    room: typeof row.room === "string" ? row.room : null, kind: String(row.kind), body: String(row.body),
    champion: typeof row.champion === "string" ? row.champion : null,
    role: typeof row.role === "string" ? row.role : null, match,
  };
}
