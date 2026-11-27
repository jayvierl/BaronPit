import { tagExcerpt } from "./tag-excerpt";
import type { NeonQueryPromise } from "@neondatabase/serverless";
import { HIDDEN_AUTHORS, visibleCommentsFor, visiblePostForInteraction } from "./community-queries";
import { createHash } from "node:crypto";
import { getSql, queryRows } from "./db";

type Kind = "post" | "comment";
const table = { post: "wp_posts", comment: "wp_comments" };
export type SubmissionStatus = "visible" | "held" | "removed" | "withdrawn";
export type SubmissionResult =
  | { ok: true; postId: number; status: SubmissionStatus }
  | { ok: false; error: string; reconsider?: boolean };

export { validSubmissionId } from "./ids";

export function submissionHash(payload: unknown): string {
  const normalized = JSON.stringify(payload, (_, value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0))
      : value);
  return createHash("sha256").update(normalized).digest("hex");
}

type Sql = Awaited<ReturnType<typeof getSql>>;
export async function insertSubmission(
  sql: Sql,
  query: NeonQueryPromise<false, false, Record<string, unknown>[]>,
  key: string | null,
  authorId: number,
) {
  if (!key) return await query;
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(${authorId}::int, hashtext(${key}))`,
    query,
  ]);
  return rows;
}

export async function priorSubmission(
  kind: Kind,
  authorId: number,
  key: string | null,
  hash: string | null,
): Promise<SubmissionResult | null> {
  if (!key) return null;
  const [row] = await queryRows(`SELECT id, submission_hash, CASE WHEN withdrawn_at IS NULL THEN status ELSE 'withdrawn' END AS status
    FROM ${table[kind]} WHERE author_id=$1 AND submission_id=$2::uuid`, [authorId, key]);
  if (!row) return null;
  if (row.submission_hash !== hash) {
    return { ok: false, error: "This draft has already been used for a different submission. Start a new draft." };
  }
  return { ok: true, postId: Number(row.id), status: row.status as SubmissionStatus };
}

export async function withdrawSubmission(authorId: number, kind: Kind, id: number) {
  const sql = await getSql();
  const [, rows] = await sql.transaction([
    // The same per-target lock is used by filing, adjudication and appeals. A report that
    // wins this race keeps its evidence; an ordinary withdrawn post drops its text and data.
    sql`SELECT pg_advisory_xact_lock(hashtext(${"wp-review:" + kind + ":" + id}))`,
    sql(`WITH target AS MATERIALIZED (
      SELECT t.id,(t.status IN ('held','removed') OR EXISTS(SELECT 1 FROM wp_reports WHERE target_kind=$3 AND target_id=t.id AND status='open')
        OR EXISTS(SELECT 1 FROM wp_safety_holds WHERE target_kind=$3 AND target_id=t.id)
        OR EXISTS(SELECT 1 FROM wp_safety_urgent WHERE target_kind=$3 AND target_id=t.id AND reviewed_at IS NULL)) AS protected
      FROM ${table[kind]} t WHERE t.id=$2 AND t.author_id=$1
    ), changed AS (
      UPDATE ${table[kind]} t SET withdrawn_at=now(),body=CASE WHEN g.protected THEN t.body ELSE '' END
      ${kind === "post" ? ", data=CASE WHEN g.protected THEN t.data ELSE '{}'::jsonb END" : ""}
      FROM target g WHERE g.id=t.id AND t.withdrawn_at IS NULL RETURNING t.id
    ) SELECT id FROM target`, [authorId, id, kind]),
  ]);
  return rows.length > 0;
}

export async function recentSubmissions(authorId: number, before?: string) {
  // Preserve PostgreSQL microseconds. Rows in the same instant are ordered by ID then kind.
  const cursor = /^(\d{1,18})\.(\d{1,10})\.(post|comment)$/.exec(before ?? "");
  const since = cursor && Number(cursor[2]) <= 2147483647 ? cursor : null;
  function source(kind: Kind) {
    return `(SELECT '${kind}'::text AS kind,id,${kind === "post" ? "id" : "post_id"} AS post_id,created_at,withdrawn_at,
         CASE WHEN withdrawn_at IS NOT NULL THEN 'withdrawn' ELSE status END AS status,
         CASE WHEN withdrawn_at IS NULL AND status='visible' THEN body END AS excerpt
       FROM ${table[kind]} WHERE author_id=$1 AND ($2::numeric IS NULL OR
         (extract(epoch FROM created_at)*1000000,id,'${kind}'::text)<($2::numeric,$3::int,$4::text))
       ORDER BY created_at DESC,id DESC LIMIT 21)`;
  }
  const rows = await queryRows(`WITH RECURSIVE ${HIDDEN_AUTHORS}, receipts AS MATERIALIZED (
    SELECT * FROM (${source("post")} UNION ALL ${source("comment")}) mine ORDER BY created_at DESC,id DESC,kind DESC LIMIT 21
  ), candidate_replies AS (
    SELECT id FROM receipts WHERE kind='comment' AND status='visible'
  ), ${visibleCommentsFor("candidateReplies")}
  SELECT r.*, (extract(epoch FROM r.created_at)*1000000)::bigint::text AS micros,
    (r.status='visible' AND ${visiblePostForInteraction} AND (r.kind='post' OR EXISTS(
      SELECT 1 FROM thread WHERE thread.id=r.id))) AS can_open
    FROM receipts r JOIN wp_posts p ON p.id=r.post_id
    ORDER BY r.created_at DESC,r.id DESC,r.kind DESC`,
    [authorId, since?.[1] ?? null, since?.[2] ?? null, since?.[3] ?? null],
  );
  const entries = rows.slice(0, 20).map(row => ({
    kind: row.kind as Kind,
    id: Number(row.id),
    postId: Number(row.post_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    status: row.status as SubmissionStatus,
    canOpen: row.can_open === true,
    excerpt: row.can_open === true && typeof row.excerpt === "string" ? tagExcerpt(row.excerpt, 90) : "",
  }));
  const last = rows[19];
  const next = rows.length > 20 ? [last.micros, last.id, last.kind].join(".") : null;
  return { entries, next };
}
