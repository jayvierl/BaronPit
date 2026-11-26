import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type PhotoScanInput = {
  id: string;
  original: Buffer;
  image: Buffer;
  originalHash: string;
  contentHash: string;
};
type ScanResult = "approved" | "held" | "rejected" | "restricted" | "pending";

const RESPONSE_LIMIT = 4096;
const FRESHNESS_SECONDS = 300;
const DIGEST = /^[a-f0-9]{64}$/;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function addresses(value = "") {
  return new Set(value.split(",").map(email => email.trim().toLowerCase())
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)));
}

function configuration() {
  const secret = process.env.PROFILE_PHOTO_SCANNER_SECRET;
  if (process.env.PROFILE_PHOTO_SAFETY_READY !== "true" || !secret || secret.trim().length < 32) return null;
  const admins = addresses(process.env.ADMIN_EMAILS);
  const owners = addresses(process.env.SAFETY_OWNER_EMAILS);
  if ([...owners].filter(email => admins.has(email)).length < 2) return null;
  try {
    const url = new URL(process.env.PROFILE_PHOTO_SCANNER_URL || "");
    if (url.username || url.password || url.search || url.hash) return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const testMode = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development"
      || process.env.PROFILE_PHOTO_SCANNER_ALLOW_LOCAL === "true";
    const localHttp = url.protocol === "http:" && local && !process.env.VERCEL && !process.env.VERCEL_ENV && testMode;
    if (url.protocol !== "https:" && !localHttp) return null;
    return {url, secret};
  } catch {
    return null;
  }
}

export function photoScanningEnabled(): boolean {
  return configuration() !== null;
}

async function signedBody(response: Response, secret: string) {
  const signature = response.headers.get("x-scan-signature") || "";
  if (response.status !== 200 || !DIGEST.test(signature) || !response.body ||
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
      Number(response.headers.get("content-length")) > RESPONSE_LIMIT) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > RESPONSE_LIMIT) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, length);
  const expected = createHmac("sha256", secret).update(bytes).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null;
  return JSON.parse(bytes.toString("utf8")) as unknown;
}

function verdict(response: unknown, input: PhotoScanInput): ScanResult {
  if (!response || typeof response !== "object" || Array.isArray(response)) return "pending";
  const result = response as Record<string, unknown>;
  if (result.id !== input.id || result.originalHash !== input.originalHash || result.contentHash !== input.contentHash ||
      typeof result.timestamp !== "number" || !Number.isSafeInteger(result.timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - result.timestamp) > FRESHNESS_SECONDS ||
      !result.checks || typeof result.checks !== "object" || Array.isArray(result.checks)) return "pending";
  const {knownAbuse, visual, ocr} = result.checks as Record<string, unknown>;
  const checks = [knownAbuse, visual, ocr];
  if (knownAbuse === "reject" || knownAbuse === "review" || checks.includes("restricted")) return "restricted";
  if (checks.some(value => value !== "clear" && value !== "review" && value !== "reject")) return "pending";
  if (checks.includes("reject")) return "rejected";
  if (checks.includes("review")) return "held";
  return "approved";
}

// Only the configured processor sees the two byte strings. Never log a request,
// provider response, or image; the caller persists the verdict against the staged hashes.
export async function scanPhoto(input: PhotoScanInput): Promise<ScanResult> {
  const config = configuration();
  if (!config || !UUID.test(input.id) || !input.original.length || input.original.length > 1024 * 1024 ||
      !input.image.length || input.image.length > 128 * 1024 ||
      createHash("sha256").update(input.original).digest("hex") !== input.originalHash ||
      createHash("sha256").update(input.image).digest("hex") !== input.contentHash) return "pending";
  try {
    const body = JSON.stringify({
      id: input.id, originalHash: input.originalHash, contentHash: input.contentHash,
      original: input.original.toString("base64"), image: input.image.toString("base64"),
      timestamp: Math.floor(Date.now() / 1000),
    });
    const signature = createHmac("sha256", config.secret).update(body).digest("hex");
    const response = await fetch(config.url, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: {"Content-Type": "application/json", Accept: "application/json", "x-scan-signature": signature},
      body,
    });
    return verdict(await signedBody(response, config.secret), input);
  } catch {
    return "pending";
  }
}
