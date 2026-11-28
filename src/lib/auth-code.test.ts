import { createHash } from "node:crypto";
import { beforeAll, expect, it, vi } from "vitest";
import { getSql } from "./db";
import { formatSignInCode, getCurrentUser, redeemMagicLink } from "./auth";
import { TERMS_VERSION } from "./account-policy";
import { POST as requestLink } from "../app/api/auth/request-link/route";
import { POST as verify } from "../app/api/auth/verify/route";
import { POST as verifyCode } from "../app/api/auth/verify-code/route";

const send = vi.hoisted(() => vi.fn());
const cookieStore = vi.hoisted(() => ({ value: "", set(name: string, value: string) { if (name === "wp_session") this.value = value; } }));
vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
vi.mock("./auth-email", () => ({ sendMagicLinkEmail: send }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => cookieStore.value && name === "wp_session" ? { name, value: cookieStore.value } : undefined,
  set: cookieStore.set.bind(cookieStore),
  delete: () => { cookieStore.value = ""; },
}) }));

const post = (path: string, body: unknown) => new Request("https://app.test" + path, {
  method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify(body),
});
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://pglite.invalid/db");
  vi.stubEnv("APP_ORIGIN", "https://app.test");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  send.mockResolvedValue({ ok: true });
});

async function request(email: string, signup: boolean) {
  send.mockClear();
  const res = await requestLink(post("/api/auth/request-link", {
    email, mode: signup ? "signup" : "signin", ...(signup ? { ageBand: "adult" } : {}),
  }));
  expect(res.status).toBe(200);
  expect(send).toHaveBeenCalledTimes(1);
  const [to, link, , code] = send.mock.calls[0] as [string, string, boolean, string];
  expect(to).toBe(email);
  return { token: link.split("#")[1], code };
}

async function createUser(email: string) {
  const { token } = await request(email, true);
  const res = await verify(post("/api/auth/verify", {
    action: "confirm", token, ageBand: "adult", accepted: true, termsVersion: TERMS_VERSION,
  }));
  expect(res.status).toBe(200);
}

const codeCall = (email: string, code: string, action: "inspect" | "confirm" = "inspect") =>
  verifyCode(post("/api/auth/verify-code", { action, email, code }));

it("zero-pads codes to six digits", () => {
  expect(formatSignInCode(0)).toBe("000000");
  expect(formatSignInCode(42)).toBe("000042");
  expect(formatSignInCode(999999)).toBe("999999");
});

it("issues a 6-digit code with the link and stores only its hash", async () => {
  const email = "code-issued@example.com";
  const { token, code } = await request(email, true);
  expect(code).toMatch(/^\d{6}$/);
  const sql = await getSql();
  const [row] = await sql`SELECT token_hash, code_hash, code_attempts, used_at FROM wp_magic_links WHERE email=${email}`;
  expect(row.token_hash).toBe(sha256(token));
  expect(row.code_hash).toBe(sha256(`signin-code:${email}:${code}`));
  expect(row.code_hash).not.toBe(code);
  expect(row.code_attempts).toBe(0);
  expect(row.used_at).toBeNull();
});

it("signs in with the correct code and creates the same session as the link path", async () => {
  const email = "code-signin@example.com";
  await createUser(email);
  const { code } = await request(email, false);
  const inspect = await codeCall(email, code);
  expect(inspect.status).toBe(200);
  expect(await inspect.json()).toMatchObject({ ok: true, needsConsent: false });
  const confirm = await codeCall(email, code, "confirm");
  expect(confirm.status).toBe(200);
  expect(confirm.headers.get("set-cookie")).toContain("wp_session=");
  cookieStore.value = /wp_session=([^;]+)/.exec(confirm.headers.get("set-cookie") ?? "")?.[1] ?? "";
  expect(cookieStore.value).toMatch(/^[a-f0-9]{64}$/);
  expect(await getCurrentUser()).toMatchObject({ email });
  const sql = await getSql();
  const [row] = await sql`SELECT used_at FROM wp_magic_links WHERE email=${email} ORDER BY id DESC LIMIT 1`;
  expect(row.used_at).not.toBeNull();
});

it("rejects a wrong code, counts the attempt, and still accepts the right code", async () => {
  const email = "code-wrong@example.com";
  await createUser(email);
  const { code } = await request(email, false);
  const wrong = code === "000000" ? "000001" : "000000";
  const res = await codeCall(email, wrong);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body).toMatchObject({ ok: false, reason: "invalid", attemptsLeft: 4 });
  expect(body.error).toContain("4 tries left");
  const sql = await getSql();
  const [row] = await sql`SELECT code_attempts FROM wp_magic_links WHERE email=${email} ORDER BY id DESC LIMIT 1`;
  expect(row.code_attempts).toBe(1);
  expect((await codeCall(email, code)).status).toBe(200);
});

it("cancels the token at the attempt cap — the code and the link both die", async () => {
  const email = "code-locked@example.com";
  await createUser(email);
  const { token, code } = await request(email, false);
  const wrong = code === "000000" ? "000001" : "000000";
  for (let attempt = 1; attempt <= 4; attempt++) {
    expect((await codeCall(email, wrong)).status).toBe(400);
  }
  const fifth = await codeCall(email, wrong);
  expect(fifth.status).toBe(400);
  expect(await fifth.json()).toMatchObject({ ok: false, reason: "locked", attemptsLeft: 0 });
  expect((await codeCall(email, code)).status).toBe(410);
  expect(await redeemMagicLink(token, null)).toBeNull();
});

it("rejects an expired code", async () => {
  const email = "code-expired@example.com";
  await createUser(email);
  const { code } = await request(email, false);
  const sql = await getSql();
  await sql`UPDATE wp_magic_links SET expires_at = now() - interval '1 minute' WHERE email=${email}`;
  expect((await codeCall(email, code)).status).toBe(410);
});

it("makes the code single-use, and using the link consumes the code too", async () => {
  const email = "code-single@example.com";
  await createUser(email);
  const first = await request(email, false);
  expect((await codeCall(email, first.code, "confirm")).status).toBe(200);
  expect((await codeCall(email, first.code, "confirm")).status).toBe(410);

  const second = await request(email, false);
  expect(await redeemMagicLink(second.token, null)).not.toBeNull();
  expect((await codeCall(email, second.code)).status).toBe(410);
});

it("rate-limits code verification per email", async () => {
  const email = "code-ratelimit@example.com";
  for (let i = 0; i < 40; i++) {
    expect((await codeCall(email, "123456")).status).toBe(410);
  }
  expect((await codeCall(email, "123456")).status).toBe(429);
});
