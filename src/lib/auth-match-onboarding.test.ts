import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { POST as requestLink } from "../app/api/auth/request-link/route";
import { POST as verify } from "../app/api/auth/verify/route";
import { POST as postQuestion } from "../app/api/questions/route";
import { postgres } from "../../test/postgres";
import { TERMS_VERSION } from "./account-policy";
import { SESSION_COOKIE } from "./auth";
import { APP_NAME } from "./brand";
import { q } from "./db";
import { getPost } from "./social";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
const fixture = vi.hoisted(() => ({ cookie: () => undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => name === "wp_session" ? { value: fixture.cookie() } : undefined,
}) }));

const origin = "https://signup-fixture.example.test";
const email = "new-unlinked-reader@example.invalid";
const fixtureMailKey = "inert-signup-fixture-only";
const requestCookies = new AsyncLocalStorage<string | undefined>();
fixture.cookie = () => requestCookies.getStore();
type CookieJar = { session?: string };

async function post(handler: (request: Request) => Promise<Response>, path: string, body: object, browser: CookieJar) {
  const request = new Request(origin + path, { method: "POST", headers: {
    origin, "Content-Type": "application/json", ...(browser.session && { cookie: `${SESSION_COOKIE}=${browser.session}` }),
  }, body: JSON.stringify(body) });
  const response = await requestCookies.run(browser.session, () => handler(request));
  const next = /^wp_session=([a-f0-9]{64});/.exec(response.headers.get("set-cookie") ?? "")?.[1];
  if (next) browser.session = next;
  return response;
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/signup");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("RESEND_API_KEY", fixtureMailKey);
  vi.stubEnv("AUTH_RATE_KEY", fixtureMailKey);
  vi.stubEnv("AUTH_EMAIL_FROM", `${APP_NAME} <unused@example.invalid>`);
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false");
  vi.stubEnv("RIOT_API_KEY", "");
  vi.stubEnv("MODERATION_OPENAI_API_KEY", "");
  const match = { matchId: "NA1_919191", champion: "Ashe", role: "BOTTOM", gamePatch: "16.23", queueId: 420,
    playedAt: Date.now() - 60_000, durationSec: 1700, win: true, kills: 2, deaths: 1, assists: 5, cs: 122, items: [] };
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,snapshot)
    VALUES('signup-fixture-only','na1','Fixture Target','LAB',${JSON.stringify({matches:[match]})}::jsonb)`;
}, 30_000);

afterAll(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await postgres.close(); });

it("sends a welcome through the isolated mail boundary, signs up once, and publishes a new spectator's discussion", async () => {
  const writer: CookieJar = {}, replayBrowser: CookieJar = {};
  let mailCount = 0;
  let welcome = false;
  let token: string | undefined;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url === "https://api.resend.com/emails" && request.method === "POST" &&
        request.headers.get("authorization") === `Bearer ${fixtureMailKey}`) {
      const payload = await request.json();
      if (payload.to !== email || mailCount !== 0) return new Response(null, { status: 403 });
      const link = /https:\/\/signup-fixture\.example\.test\/signin\/confirm#([a-f0-9]{64})/.exec(String(payload.text));
      token = link?.[1];
      welcome = !!link && payload.subject === `Welcome to ${APP_NAME}` && String(payload.html).includes(link[0]);
      mailCount++;
      return Response.json({ id: "fixture-welcome" });
    }
    if (request.url === "https://ddragon.leagueoflegends.com/api/versions.json") return Response.json(["16.23.1"]);
    if (request.url === "https://ddragon.leagueoflegends.com/cdn/16.23.1/data/en_US/champion.json") {
      return Response.json({ data: { Ashe: { id: "Ashe", name: "Ashe", title: "the Frost Archer", tags: ["Marksman"] } } });
    }
    throw new Error("Unconfigured fixture request blocked");
  });

  const destination = "/questions/new?platform=na1&riotId=Fixture+Target%23LAB&matchId=NA1_919191";
  const signup = await post(requestLink, "/api/auth/request-link", { email, mode: "signup", ageBand: "adult", next: destination }, writer);
  expect(signup.status).toBe(200);
  expect((await signup.text()) === '{"ok":true}').toBe(true);
  expect({ mailCount, welcome, session: Boolean(writer.session) }).toEqual({ mailCount: 1, welcome: true, session: false });
  if (!token) throw new Error("The fixture did not receive a valid welcome link");

  const verifyLink = (body: object, browser = writer) => post(verify, "/api/auth/verify", { token, ...body }, browser);
  const preview = await verifyLink({ action: "inspect" }, replayBrowser);
  expect(preview.status).toBe(200);
  expect((await preview.json()).needsConsent).toBe(true);
  expect(preview.headers.has("set-cookie")).toBe(false);
  expect((await verifyLink({ action: "confirm", ageBand: "adult", accepted: false, termsVersion: TERMS_VERSION })).status).toBe(410);
  expect(await q`SELECT count(*)::int AS n FROM wp_users`).toEqual([{ n: 0 }]);

  const consent = { action: "confirm", ageBand: "adult", accepted: true, termsVersion: TERMS_VERSION };
  const confirmed = await verifyLink(consent);
  expect(confirmed.status).toBe(200);
  expect((await confirmed.json()).returnTo === destination).toBe(true);
  const cookie = confirmed.headers.get("set-cookie") ?? "";
  expect(/httponly/i.test(cookie) && /secure/i.test(cookie) && /samesite=lax/i.test(cookie) && Boolean(writer.session)).toBe(true);
  const replay = await verifyLink(consent, replayBrowser);
  expect(replay.status).toBe(410);
  expect(replay.headers.has("set-cookie") || Boolean(replayBrowser.session)).toBe(false);

  const [user] = await q`SELECT id,age_band,terms_version,terms_accepted_at IS NOT NULL AS accepted,
      display_name ~ '^Player [a-f0-9]{8}$' AS pseudonymous FROM wp_users WHERE email=${email}`;
  expect(user).toMatchObject({ age_band: "adult", terms_version: TERMS_VERSION, accepted: true, pseudonymous: true });
  expect(await q`SELECT count(*)::int AS n FROM wp_sessions`).toEqual([{ n: 1 }]);
  expect(await q`SELECT count(*)::int AS n FROM wp_links WHERE user_id=${user.id}`).toEqual([{ n: 0 }]);

  const question = { action: "ask", discussionKind: "question", confirmPublicMatch: true, platform: "na1", riotId: "Fixture Target#LAB",
    matchId: "NA1_919191", champion: "Ashe", role: "Bot", topic: "Objective", body: "Should Ashe clear the wave before heading to the dragon?" };
  expect((await post(postQuestion, "/api/questions", question, replayBrowser)).status).toBe(401);
  const receipt = await post(postQuestion, "/api/questions", question, writer);
  expect(receipt.status).toBe(201);
  const { postId, status } = await receipt.json();
  // Clean posts publish immediately now, even from a brand-new account.
  expect(status).toBe("visible");
  const [published] = await q`SELECT author_id,status,data#>>'{matchContext,authorRole}' AS role FROM wp_posts WHERE id=${postId}`;
  expect(published).toMatchObject({ author_id: user.id, status: "visible", role: "spectator" });
  expect(await getPost(postId, null)).not.toBeNull();
});
