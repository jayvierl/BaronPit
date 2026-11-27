import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { postgres } from "../../../../test/postgres";
import { q } from "@/lib/db";
import { GET } from "./held/route";
import { POST } from "./decide/route";

vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../../../test/postgres")).neonForTests,
}));

const KEY = "test-moderation-key";
const heldReq = (key?: string) =>
  new Request("https://app.test/api/moderation/held", {
    headers: key ? { "x-moderation-key": key } : {},
  });
const decideReq = (body: unknown, key?: string) =>
  new Request("https://app.test/api/moderation/decide", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-moderation-key": key } : {}) },
    body: JSON.stringify(body),
  });
const decision = { targetType: "post", targetId: 101, decision: "approve", reason: "Approve: genuine post" };

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://local-fixture.invalid/moderation-api");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`INSERT INTO wp_users(id,email,display_name,created_at)
    VALUES (1,'author@fixtures.invalid','Author',now()-interval '30 days')`;
  await q`INSERT INTO wp_posts(id,author_id,kind,body,status)
    VALUES (101,1,'text','Held for review','held')`;
}, 30000);

beforeEach(async () => {
  vi.stubEnv("MODERATION_API_KEY", KEY);
  await q`UPDATE wp_posts SET status='held' WHERE id=101`;
  await q`DELETE FROM wp_mod_decisions`;
});

afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});

describe("moderation API key gate", () => {
  it("returns 503 from both routes when the key is not configured", async () => {
    vi.stubEnv("MODERATION_API_KEY", "");
    expect((await GET(heldReq(KEY))).status).toBe(503);
    expect((await POST(decideReq(decision, KEY))).status).toBe(503);
  });

  it("rejects missing and wrong keys with 401", async () => {
    expect((await GET(heldReq())).status).toBe(401);
    expect((await GET(heldReq("wrong-key"))).status).toBe(401);
    expect((await POST(decideReq(decision))).status).toBe(401);
    expect((await POST(decideReq(decision, "wrong-key"))).status).toBe(401);
    // And nothing was decided while the gate was closed.
    expect(await q`SELECT status FROM wp_posts WHERE id=101`).toEqual([{ status: "held" }]);
  });

  it("serves the queue and applies decisions with the right key", async () => {
    const list = await GET(heldReq(KEY));
    expect(list.status).toBe(200);
    const payload = (await list.json()) as { ok: boolean; items: { targetType: string; targetId: number }[] };
    expect(payload.ok).toBe(true);
    expect(payload.items).toContainEqual(expect.objectContaining({ targetType: "post", targetId: 101 }));

    const decided = await POST(decideReq(decision, KEY));
    expect(decided.status).toBe(200);
    expect(await decided.json()).toMatchObject({ ok: true, priorStatus: "held", newStatus: "visible" });
    expect(await q`SELECT status FROM wp_posts WHERE id=101`).toEqual([{ status: "visible" }]);
  });
});
