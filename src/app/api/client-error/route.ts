import { createHash } from "node:crypto";
import { isSameOriginWrite, readObject } from "@/lib/auth-http";
import { consumeWindow } from "@/lib/rate-window";

// Stopgap until a real error tracker is adopted: accepts the minimal report
// from src/lib/report-error.ts and logs one structured JSON line. The per-IP
// window keeps this from being usable as a log-flooding amplifier; when the
// window is exhausted (or storage is unavailable) reports are dropped, never
// amplified.
export async function POST(req: Request) {
  if (!isSameOriginWrite(req)) return new Response(null, { status: 403 });
  const ip = process.env.VERCEL
    ? (req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim()
    : "local";
  const bucket = "client-error:" + createHash("sha256").update(ip).digest("hex");
  let allowed = false;
  try {
    allowed = await consumeWindow(bucket, 30, 1);
  } catch {
    allowed = false;
  }
  if (!allowed) return new Response(null, { status: 429 });
  const { message, digest, path } = await readObject(req);
  console.error(JSON.stringify({
    source: "client-error",
    message: typeof message === "string" ? message.slice(0, 500) : "",
    digest: typeof digest === "string" ? digest.slice(0, 128) : "",
    path: typeof path === "string" ? path.slice(0, 256) : "",
  }));
  return new Response(null, { status: 204 });
}
