import { createHash, randomBytes } from "node:crypto";
import { beforeAll, expect, it, vi } from "vitest";
import { getSql } from "./db";
import { TERMS_VERSION } from "./account-policy";
import {
  VERIFICATION_ICON_IDS, pickVerificationIcon, startLinkVerification, checkLinkVerification,
} from "./link-verification";
import { POST as verifyRoute } from "../app/api/account/link-verification/route";
import { POST as unlink } from "../app/api/account/unlink/route";

const iconFetch = vi.hoisted(() => vi.fn());
const cookieStore = vi.hoisted(() => ({ value: "" }));
vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
vi.mock("./riot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./riot")>()),
  fetchCurrentProfileIcon: iconFetch,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => cookieStore.value && name === "wp_session" ? { name, value: cookieStore.value } : undefined,
  set: () => {}, delete: () => { cookieStore.value = ""; },
}) }));

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const post = (path: string, body: unknown) => new Request("https://app.test" + path, {
  method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify(body),
});

let userA = 0;
let userB = 0;
const PUUID_A = "puuid-icon-a";
const PUUID_B = "puuid-icon-b";

async function seedUser(email: string): Promise<number> {
  const sql = await getSql();
  const [row] = await sql`INSERT INTO wp_users (email, display_name, age_band, terms_version, terms_accepted_at)
    VALUES (${email}, ${email}, 'adult', ${TERMS_VERSION}, now()) RETURNING id`;
  return Number(row.id);
}

async function seedLink(userId: number, puuid: string, icon: number) {
  const sql = await getSql();
  await sql`INSERT INTO wp_players (puuid, platform, game_name, tag_line, profile_icon)
    VALUES (${puuid}, 'na1', 'Icon Tester', 'NA1', ${icon}) ON CONFLICT (puuid) DO NOTHING`;
  await sql`INSERT INTO wp_links (user_id, puuid, verified) VALUES (${userId}, ${puuid}, false)`;
}

async function signInAs(userId: number) {
  const sql = await getSql();
  const token = randomBytes(32).toString("hex");
  await sql`INSERT INTO wp_sessions (user_id, token_hash, expires_at) VALUES (${userId}, ${sha256(token)}, now() + interval '1 day')`;
  cookieStore.value = token;
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://pglite.invalid/db");
  vi.stubEnv("APP_ORIGIN", "https://app.test");
  const sql = await getSql();
  // First query runs the lazy schema so the seed inserts have tables to hit.
  await sql`SELECT 1 FROM wp_users LIMIT 1`;
  userA = await seedUser("icon-a@example.com");
  userB = await seedUser("icon-b@example.com");
  await seedLink(userA, PUUID_A, 7);
  await seedLink(userB, PUUID_B, 3);
});

it("never assigns the icon the account currently has", () => {
  for (const current of VERIFICATION_ICON_IDS) {
    const picked = pickVerificationIcon(current, () => 0);
    expect(picked).not.toBe(current);
    expect(VERIFICATION_ICON_IDS).toContain(picked);
  }
  expect(pickVerificationIcon(0, () => 0)).toBe(1);
  expect(pickVerificationIcon(5, () => 0)).toBe(0);
});

it("starts a verification with a fresh icon read and stores the pending challenge", async () => {
  iconFetch.mockResolvedValue({ status: 200, icon: 7 });
  const result = await startLinkVerification(userA, PUUID_A);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.iconId).not.toBe(7);
  expect(VERIFICATION_ICON_IDS).toContain(result.iconId);
  const sql = await getSql();
  const [row] = await sql`SELECT icon_id, expires_at FROM wp_link_verifications WHERE user_id=${userA} AND puuid=${PUUID_A}`;
  expect(Number(row.icon_id)).toBe(result.iconId);
  expect(new Date(String(row.expires_at)).getTime()).toBeGreaterThan(Date.now() + 25 * 60 * 1000);
});

it("starts nothing when the current icon cannot be read", async () => {
  iconFetch.mockResolvedValue({ status: 503, icon: null });
  expect(await startLinkVerification(userB, PUUID_B)).toEqual({ ok: false, code: "key_unavailable" });
  const sql = await getSql();
  const rows = await sql`SELECT 1 FROM wp_link_verifications WHERE user_id=${userB} AND puuid=${PUUID_B}`;
  expect(rows.length).toBe(0);
});

it("keeps the link unverified on an icon mismatch and allows re-checking", async () => {
  iconFetch.mockResolvedValue({ status: 200, icon: 7 });
  const started = await startLinkVerification(userA, PUUID_A);
  expect(started.ok).toBe(true);
  expect(await checkLinkVerification(userA, PUUID_A)).toEqual({ ok: false, code: "mismatch" });
  const sql = await getSql();
  const [link] = await sql`SELECT verified FROM wp_links WHERE user_id=${userA} AND puuid=${PUUID_A}`;
  expect(link.verified).toBe(false);
  const pending = await sql`SELECT 1 FROM wp_link_verifications WHERE user_id=${userA} AND puuid=${PUUID_A}`;
  expect(pending.length).toBe(1);
});

it("flips verified and clears the pending challenge when the icon matches", async () => {
  const sql = await getSql();
  const [pending] = await sql`SELECT icon_id FROM wp_link_verifications WHERE user_id=${userA} AND puuid=${PUUID_A}`;
  iconFetch.mockResolvedValue({ status: 200, icon: Number(pending.icon_id) });
  expect(await checkLinkVerification(userA, PUUID_A)).toEqual({ ok: true });
  const [link] = await sql`SELECT verified FROM wp_links WHERE user_id=${userA} AND puuid=${PUUID_A}`;
  expect(link.verified).toBe(true);
  const left = await sql`SELECT 1 FROM wp_link_verifications WHERE user_id=${userA} AND puuid=${PUUID_A}`;
  expect(left.length).toBe(0);
});

it("rejects an expired pending verification", async () => {
  const sql = await getSql();
  await sql`INSERT INTO wp_link_verifications (user_id, puuid, icon_id, expires_at)
    VALUES (${userB}, ${PUUID_B}, 11, now() - interval '1 minute')`;
  iconFetch.mockResolvedValue({ status: 200, icon: 11 });
  expect(await checkLinkVerification(userB, PUUID_B)).toEqual({ ok: false, code: "expired" });
  const [link] = await sql`SELECT verified FROM wp_links WHERE user_id=${userB} AND puuid=${PUUID_B}`;
  expect(link.verified).toBe(false);
});

it("does not let another user start or check verification for my link", async () => {
  expect(await startLinkVerification(userB, PUUID_A)).toEqual({ ok: false, code: "not_linked" });
  expect(await checkLinkVerification(userB, PUUID_A)).toEqual({ ok: false, code: "not_linked" });
  await signInAs(userB);
  const started = await verifyRoute(post("/api/account/link-verification", { action: "start", puuid: PUUID_A }));
  expect(started.status).toBe(404);
  const checked = await verifyRoute(post("/api/account/link-verification", { action: "check", puuid: PUUID_A }));
  expect(checked.status).toBe(404);
});

it("clears the pending challenge when the link is removed", async () => {
  iconFetch.mockResolvedValue({ status: 200, icon: 3 });
  expect((await startLinkVerification(userB, PUUID_B)).ok).toBe(true);
  await signInAs(userB);
  const res = await unlink(post("/api/account/unlink", { puuid: PUUID_B }));
  expect(res.status).toBe(200);
  const sql = await getSql();
  const rows = await sql`SELECT 1 FROM wp_link_verifications WHERE user_id=${userB} AND puuid=${PUUID_B}`;
  expect(rows.length).toBe(0);
});
