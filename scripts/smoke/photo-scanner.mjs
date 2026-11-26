// Private test provider. This URL is intercepted by the local PostgreSQL smoke transport.
import { createHash, createHmac } from "node:crypto";

export const fixturePhotoEnv = {
  PROFILE_PHOTO_SCANNER_URL: "https://photo-scan.example.invalid/review",
  PROFILE_PHOTO_SCANNER_SECRET: "local-fixture-photo-scanner-key-no-production-use",
  PROFILE_PHOTO_SAFETY_READY: "true",
  ADMIN_EMAILS: "first@example.invalid,second@example.invalid",
  SAFETY_OWNER_EMAILS: "first@example.invalid,second@example.invalid",
};

export async function clearFixturePhoto(request) {
  const input = await request.text();
  const signatureFor = (bytes) => createHmac("sha256", fixturePhotoEnv.PROFILE_PHOTO_SCANNER_SECRET).update(bytes).digest("hex");
  if (request.headers.get("x-scan-signature") !== signatureFor(input)) throw new Error("Invalid fixture scan request signature");
  const { id, originalHash, contentHash, original, image } = JSON.parse(input);
  const hash = (base64) => createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
  if (hash(original) !== originalHash || hash(image) !== contentHash) {
    throw new Error("Fixture scanner received image bytes that do not match the requested hashes");
  }
  const body = JSON.stringify({
    id, originalHash, contentHash, timestamp: Math.floor(Date.now() / 1000),
    checks: { knownAbuse: "clear", visual: "clear", ocr: "clear" },
  });
  return new Response(body, { headers: { "content-type": "application/json", "x-scan-signature": signatureFor(body) } });
}
