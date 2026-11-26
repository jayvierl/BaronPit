import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { ModResult } from "./moderation";
import { getSql } from "./db";

type Surface = "post" | "comment" | "profile" | "duo";
type Verdict = "clear" | "review" | "child_safety" | "unavailable";
interface ProviderRow { flagged?: unknown; categories?: Record<string,unknown> }

export async function managedTextVerdict(fields: string[]): Promise<Verdict> {
  const key = process.env.MODERATION_OPENAI_API_KEY?.trim();
  const input = submittedFields(fields);
  if (!key || !input.length) return "clear";
  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST", cache:"no-store", redirect:"error", signal:AbortSignal.timeout(4000),
      headers: { Authorization:"Bearer " + key, "Content-Type":"application/json" },
      body:JSON.stringify({model:"omni-moderation-latest",input}),
    });
    if (!response.ok) return "unavailable";
    const data = await response.json();
    const results: ProviderRow[] = Array.isArray(data?.results) ? data.results : [];
    // Missing fields or partial batch results cannot clear the entire submission.
    if (results.some(r => r?.categories?.["sexual/minors"] === true)) return "child_safety";
    if (results.length !== input.length || results.some(r => typeof r?.flagged !== "boolean" ||
        typeof r.categories?.["sexual/minors"] !== "boolean" || Object.values(r.categories).some(v => typeof v !== "boolean"))) return "unavailable";
    return results.some(r => r.flagged || Object.values(r.categories!).some(Boolean)) ? "review" : "clear";
  } catch { return "unavailable"; }
}

function submittedFields(fields: string[]) {
  return fields.map(field => field.trim()).filter(Boolean);
}

async function recordRestrictedText(fields: string[], userId: number, surface: Surface) {
  const input = JSON.stringify(submittedFields(fields));
  const digest = createHash("sha256").update(surface).update("\0").update(input).digest("hex");
  const sql = await getSql();
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"wp-review:user:" + userId}))`,
    sql`INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence)
      VALUES(${randomUUID()}::uuid,'user',${userId},'child_safety','Restricted submission screened by the text processor')
      ON CONFLICT(target_kind,target_id) WHERE reviewed_at IS NULL DO NOTHING`,
    sql`WITH captured AS (
      INSERT INTO wp_safety_text_evidence(receipt,digest,surface,fields)
      SELECT receipt,${digest},${surface},${input}::jsonb FROM wp_safety_urgent
      WHERE target_kind='user' AND target_id=${userId} AND reviewed_at IS NULL
      ON CONFLICT(receipt,digest) DO NOTHING RETURNING receipt
    ) UPDATE wp_safety_urgent u SET rule='child_safety',release_requested_by=NULL
      FROM captured c WHERE u.receipt=c.receipt`,
  ]);
}

export async function screenText(local: ModResult, fields: string[], userId: number, surface: Surface): Promise<ModResult> {
  const verdict = await managedTextVerdict(fields);
  if (verdict === "clear") return local;
  if (verdict === "child_safety") {
    // Preserve the unpublished submission in the restricted store for this case.
    await recordRestrictedText(fields, userId, surface);
    return {...local,action:"block",score:Math.max(60,local.score),hits:["restricted-review"]};
  }
  if (local.action === "block") return local;
  return {...local,action:"hold",score:Math.max(30,local.score),
    hits:[...local.hits, verdict === "unavailable" ? "screening-unavailable" : "managed-review"]};
}
