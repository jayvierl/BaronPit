// Read only the connected store's listing metadata. Never read objects or emit names or URLs.
import { pathToFileURL } from "node:url";

export async function inventory(token, request=fetch) {
  if (!token) return {status:"not configured"};
  const seen=new Set();
  let cursor="", objects=0, bytes=0;
  do {
    const url=new URL("https://vercel.com/api/blob");
    url.searchParams.set("limit","1000");
    if (cursor) url.searchParams.set("cursor",cursor);
    const response=await request(url,{headers:{Authorization:"Bearer "+token,"x-api-version":"13"},
      redirect:"error",signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error("Store inventory unavailable (HTTP "+response.status+")");
    const page=await response.json();
    if (!Array.isArray(page.blobs) || typeof page.hasMore!=="boolean") throw new Error("Invalid inventory page");
    for (const item of page.blobs) {
      if (!Number.isSafeInteger(item.size) || item.size<0) throw new Error("Invalid object size");
      bytes+=item.size;objects++;
    }
    if (!page.hasMore) break;
    if (typeof page.cursor!=="string" || !page.cursor || seen.has(page.cursor)) throw new Error("Invalid inventory cursor");
    cursor=page.cursor;
    seen.add(cursor);
  } while (true);
  return {status:"complete",objects,bytes};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    console.log("Legacy media inventory", JSON.stringify(await inventory(process.env.BLOB_READ_WRITE_TOKEN)));
    if (process.argv.includes("--community")) {
      if (!process.env.DATABASE_URL) console.log("Legacy media references unavailable");
      else {
        const {neon} = await import("@neondatabase/serverless");
        const sql = neon(process.env.DATABASE_URL);
        const [counts] = await sql`SELECT count(*)::int posts, count(*) FILTER(WHERE status='held')::int held,
          count(*) FILTER(WHERE EXISTS(SELECT 1 FROM wp_reports r WHERE r.status='open' AND r.target_kind='post' AND r.target_id=p.id))::int reported
          FROM wp_posts p WHERE p.kind='media'`;
        console.log("Legacy media references", JSON.stringify(counts));
      }
    }
  } catch {
    console.error("Legacy media inventory was unavailable. An authorised operator must rerun the read-only check.");
    process.exitCode=1;
  }
}
