import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { neon } from "@neondatabase/serverless";

export function pagingEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Configure a private HTTPS paging endpoint");
  return url;
}

// Only these fields may cross the on-call boundary. No report category, author or evidence.
export function pageEnvelope(row) {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.receipt)) throw new Error("Invalid receipt");
  return { event: "community.safety.urgent", receipt: row.receipt, openedAt: new Date(row.opened_at).toISOString() };
}

export async function deliverPage(row, endpoint, token, send = fetch) {
  const payload = pageEnvelope(row);
  const response = await send(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(6000),
    headers: { "content-type": "application/json", "idempotency-key": payload.receipt, authorization: "Bearer " + token },
    body: JSON.stringify(payload) });
  await response.body?.cancel();
  if (!response.ok) throw new Error("On-call delivery unconfirmed");
}

// The incident itself is the durable outbox. An unavailable pager cannot erase a report.
export async function dispatchBatch(db, deliver) {
  await db`INSERT INTO wp_safety_page_delivery(receipt,opened_at)
    SELECT i.receipt,i.opened_at FROM wp_safety_urgent i
    WHERE i.reviewed_at IS NULL AND NOT EXISTS (SELECT 1 FROM wp_safety_page_delivery p WHERE p.receipt=i.receipt)
    ORDER BY i.opened_at LIMIT 100 ON CONFLICT DO NOTHING`;
  const lease = randomUUID();
  const rows = await db`WITH candidates AS (
    SELECT receipt FROM wp_safety_page_delivery WHERE delivered_at IS NULL AND next_attempt<=now()
    ORDER BY opened_at LIMIT 10 FOR UPDATE SKIP LOCKED
  ) UPDATE wp_safety_page_delivery p SET lease_id=${lease},next_attempt=now()+interval '2 minutes',attempts=attempts+1
    FROM candidates c WHERE c.receipt=p.receipt RETURNING p.receipt,p.opened_at`;
  let failures = 0;
  for (const row of rows) {
    try {
      await deliver(row);
      await db`UPDATE wp_safety_page_delivery SET delivered_at=now(),lease_id=NULL WHERE receipt=${row.receipt} AND lease_id=${lease}`;
    } catch {
      failures++;
      await db`UPDATE wp_safety_page_delivery SET lease_id=NULL,
        next_attempt=now()+(LEAST(10,attempts) * interval '30 seconds') WHERE receipt=${row.receipt} AND lease_id=${lease}`;
    }
  }
  return { attempts: rows.length, failures };
}

async function main() {
  const url = pagingEndpoint(process.env.SAFETY_PAGE_HTTPS_URL);
  const token = process.env.SAFETY_PAGE_TOKEN?.trim();
  if (!token || !process.env.DATABASE_URL) throw new Error("Missing pager configuration");
  const db = neon(process.env.DATABASE_URL);

  const once = process.argv.includes("--once");
  do {
    try {
      const result = await dispatchBatch(db, row => deliverPage(row, url, token));
      if (result.attempts > 0) console.log(JSON.stringify(result));
      if (once && result.failures) process.exitCode = 1;
    } catch {
      console.error("Urgent paging unavailable. Check the owner queue and worker health.");
      if (once) process.exitCode = 1;
    }
    if (!once) await sleep(15000);
  } while (!once);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Safety pager could not start. Check settings and restricted database access."); process.exitCode = 1; });
}
