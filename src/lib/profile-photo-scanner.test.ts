import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { photoScanningEnabled, scanPhoto } from "./profile-photo-scanner";

const secret = "local-only-scanner-test-fixture-secret";
const original = Buffer.from("synthetic original image bytes");
const image = Buffer.from("synthetic normalized image bytes");
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const input = {id: "b800466a-f67e-4e30-9040-143d53c2aa61", original, image, originalHash: digest(original), contentHash: digest(image)};
const checks = {knownAbuse: "clear", visual: "clear", ocr: "clear"};

const fakeFetch = vi.fn<typeof fetch>();
function result(change: Record<string, unknown> = {}) {
  return JSON.stringify({id: input.id, originalHash: input.originalHash, contentHash: input.contentHash,
    timestamp: Math.floor(Date.now() / 1000), checks, ...change});
}
function signed(text: string, key = secret, status = 200) {
  return new Response(text, {status, headers: {"Content-Type": "application/json; charset=UTF-8",
    "x-scan-signature": createHmac("sha256", key).update(text).digest("hex")}});
}

beforeEach(() => {
  vi.stubEnv("PROFILE_PHOTO_SCANNER_URL", "https://scanner.example.test/review");
  vi.stubEnv("PROFILE_PHOTO_SCANNER_SECRET", secret);
  vi.stubEnv("PROFILE_PHOTO_SAFETY_READY", "true");
  vi.stubEnv("PROFILE_PHOTO_SCANNER_ALLOW_LOCAL", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("ADMIN_EMAILS", "alpha@example.test,BRAVO@example.test");
  vi.stubEnv("SAFETY_OWNER_EMAILS", "alpha@example.test, bravo@example.test");
  fakeFetch.mockReset();
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("private profile photo scanner", () => {
  it("requires operator readiness, independent responder identities and a configured secret", async () => {
    expect(photoScanningEnabled()).toBe(true);
    vi.stubEnv("SAFETY_OWNER_EMAILS", "alpha@example.test, ALPHA@EXAMPLE.TEST, third@example.test");
    expect(photoScanningEnabled()).toBe(false);
    vi.stubEnv("SAFETY_OWNER_EMAILS", "alpha@example.test,bravo@example.test");
    vi.stubEnv("PROFILE_PHOTO_SCANNER_SECRET", "short");
    expect(photoScanningEnabled()).toBe(false);
    vi.stubEnv("PROFILE_PHOTO_SCANNER_SECRET", secret);
    vi.stubEnv("PROFILE_PHOTO_SAFETY_READY", "false");
    expect(await scanPhoto(input)).toBe("pending");
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("uses HTTPS outside explicitly local fixtures and disallows URL credentials", () => {
    for (const url of ["http://processor.example.test", "https://name@processor.example.test",
      "http://localhost.example.test", "https://processor.example.test/?key=example"]) {
      vi.stubEnv("PROFILE_PHOTO_SCANNER_URL", url);
      expect(photoScanningEnabled()).toBe(false);
    }
    vi.stubEnv("PROFILE_PHOTO_SCANNER_URL", "http://127.0.0.1:12345/fixture");
    vi.stubEnv("NODE_ENV", "production");
    expect(photoScanningEnabled()).toBe(false);
    vi.stubEnv("PROFILE_PHOTO_SCANNER_ALLOW_LOCAL", "true");
    expect(photoScanningEnabled()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(photoScanningEnabled()).toBe(false);
  });

  it("signs both image byte strings and validates a signed clear result for the same staged asset", async () => {
    fakeFetch.mockResolvedValue(signed(result()));
    expect(await scanPhoto(input)).toBe("approved");
    const [url, init] = fakeFetch.mock.calls[0];
    expect(String(url)).toBe("https://scanner.example.test/review");
    expect(init).toMatchObject({method:"POST",cache:"no-store",redirect:"error"});
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = String(init?.body);
    expect(new Headers(init?.headers).get("x-scan-signature")).toBe(createHmac("sha256",secret).update(body).digest("hex"));
    expect(JSON.parse(body)).toMatchObject({id: input.id, originalHash: input.originalHash, contentHash: input.contentHash,
      original: original.toString("base64"), image: image.toString("base64"), timestamp: expect.any(Number)});
  });

  it("keeps malformed input private without contacting the scanner", async () => {
    for (const changes of [
      {contentHash: "wrong"}, {originalHash: "wrong"}, {image: Buffer.alloc(0)},
      {original: Buffer.alloc(1024 * 1024 + 1)}, {image: Buffer.alloc(128 * 1024 + 1)}, {id: "invalid"},
    ]) expect(await scanPhoto({...input,...changes})).toBe("pending");
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("rejects missing, expired, wrong-asset, malformed and incorrectly signed results", async () => {
    const now = Math.floor(Date.now()/1000);
    for (const reply of [
      signed(result({contentHash: digest(original)})), signed(result({originalHash: digest(image)})),
      signed(result({id: "00000000-0000-0000-0000-000000000001"})),
      signed(result({timestamp: now-310})), signed(result({timestamp: now+310})), signed(result({timestamp: String(now)})),
      signed(result({checks:{visual:"clear",knownAbuse:"clear"}})), signed(result({checks:{...checks,ocr:"provider_timeout"}})),
      signed(result(), "unrelated fixture"), signed("{"), signed(result(),secret,503),
      new Response(result(), {headers:{"Content-Type":"application/json"}}),
    ]) {
      fakeFetch.mockResolvedValueOnce(reply);
      expect(await scanPhoto(input)).toBe("pending");
    }
    fakeFetch.mockRejectedValueOnce(new DOMException("Timed out","TimeoutError"));
    expect(await scanPhoto(input)).toBe("pending");
  });

  it("separates ordinary holds and rejection from restricted evidence", async () => {
    for (const [change, expected] of [
      [{visual:"reject"}, "rejected"], [{ocr:"review"}, "held"], [{ocr:"restricted"}, "restricted"],
      [{knownAbuse:"review"}, "restricted"], [{knownAbuse:"reject"}, "restricted"],
      [{visual:"restricted",ocr:"error"}, "restricted"], [{visual:"reject",ocr:"error"}, "pending"],
    ] as const) {
      fakeFetch.mockResolvedValueOnce(signed(result({checks:{...checks,...change}})));
      expect(await scanPhoto(input)).toBe(expected);
    }
  });

  it("bounds the response body without relying on Content-Length", async () => {
    fakeFetch.mockResolvedValueOnce(signed(result({filler:"x".repeat(4096)})));
    expect(await scanPhoto(input)).toBe("pending");
  });
});
