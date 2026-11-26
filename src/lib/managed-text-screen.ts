import "server-only";
import { randomUUID } from "node:crypto";
import type { ModResult } from "./moderation";
import { q } from "./db";

type Surface = "post" | "comment" | "profile" | "duo";
type Verdict = "clear" | "review" | "child_safety" | "unavailable";
interface ProviderRow { flagged?: unknown; categories?: Record<string,unknown> }

export async function managedTextVerdict(fields: string[]): Promise<Verdict> {
  const key = process.env.MODERATION_OPENAI_API_KEY?.trim();
  const input = fields.map(field => field.trim()).filter(Boolean);
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

export async function screenText(local: ModResult, fields: string[], userId: number, surface: Surface): Promise<ModResult> {
  const verdict = await managedTextVerdict(fields);
  if (verdict === "clear") return local;
  if (verdict === "child_safety") {
    // Hold the unpublished submission privately. No auto-sanction and no public or ordinary-queue copy.
    // This case shares the owner queue, two-reviewer release and pager used for urgent player reports.
    const evidence = ("Automated review of a submitted " + surface + ".\n" + fields.join("\n")).slice(0,1200);
    await q`INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence)
      VALUES(${randomUUID()}::uuid,'user',${userId},'child_safety',${evidence})
      ON CONFLICT(target_kind,target_id) WHERE reviewed_at IS NULL DO NOTHING`;
    return {...local,action:"block",score:Math.max(60,local.score),hits:["restricted-review"]};
  }
  if (local.action === "block") return local;
  return {...local,action:"hold",score:Math.max(30,local.score),
    hits:[...local.hits, verdict === "unavailable" ? "screening-unavailable" : "managed-review"]};
}
