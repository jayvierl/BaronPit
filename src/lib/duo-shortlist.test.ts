import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { POST as changeShortlist } from "../app/api/social/duo-shortlist/route";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { changeDuoPin, duoShortlist, duoShortlistLimit, pinnedDuoIds } from "./duo-shortlist";
import { setBlock, setMute } from "./social";
import { TERMS_VERSION } from "./account-policy";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
const session = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: session.token }) }) }));

const ownerToken = "1".repeat(64);
const otherToken = "2".repeat(64);
const origin = "https://shortlist.test";

function update(body: unknown, requestOrigin = origin) {
  return changeShortlist(new Request(origin + "/api/social/duo-shortlist", {
    method: "POST",
    headers: { origin: requestOrigin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://local-fixture.invalid/shortlist");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`INSERT INTO wp_users(id,email,display_name,age_band,terms_version,terms_accepted_at)
    SELECT id,'fixture-' || id || '@example.test','Player ' || id,'adult',${TERMS_VERSION},now()
    FROM generate_series(1,${duoShortlistLimit + 10}) AS id`;
  for (const [id, token] of [[1, ownerToken], [2, otherToken]] as const) {
    await q`INSERT INTO wp_sessions(user_id,token_hash,expires_at)
      VALUES (${id},${createHash("sha256").update(token).digest("hex")},now()+interval '1 day')`;
  }
}, 30000);

beforeEach(async () => {
  session.token = ownerToken;
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false");
  await q`TRUNCATE wp_duo_shortlist,wp_blocks,wp_mutes,wp_follows,wp_rate_events`;
  await q`UPDATE wp_users SET banned_until=NULL,safety_status='visible',terms_version=${TERMS_VERSION}`;
});

afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});

it("pins only for the current owner, is idempotent, and leaves follows separate", async () => {
  session.token = "";
  expect((await update({ playerId: 3, active: true })).status).toBe(401);
  session.token = ownerToken;
  expect((await update({ playerId: 3, active: true }, "https://outside.test")).status).toBe(403);
  expect((await update({ playerId: 1, active: true })).status).toBe(400);
  expect((await update({ playerId: 300, active: true })).status).toBe(404);
  const result = await update({ playerId: 3, active: true, ownerId: 2 });
  expect(await result.json()).toEqual({ ok: true, active: true });
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await update({ playerId: 3, active: true })).status).toBe(200);
  expect(await pinnedDuoIds(1, [3, 4])).toEqual([3]);
  expect(await duoShortlist(1)).toEqual({
    players: [{ id: 3, name: "Player 3", hue: 140, avatar: { kind: "initials" } }], hasUnavailable: false,
  });
  expect(await duoShortlist(2)).toEqual({ players: [], hasUnavailable: false });
  expect(await q`SELECT * FROM wp_follows`).toEqual([]);

  session.token = otherToken;
  expect(await (await update({ playerId: 3, active: false, ownerId: 1 })).json()).toEqual({ ok: true, active: false });
  expect(await pinnedDuoIds(1, [3])).toEqual([3]);
  session.token = ownerToken;
  expect((await update({ playerId: 3, active: false })).status).toBe(200);
  expect(await duoShortlist(1)).toEqual({ players: [], hasUnavailable: false });
});

it("hides muted and restricted targets and removes pins permanently when either person blocks", async () => {
  for (const [owner, target] of [[1, 2], [2, 1], [1, 3]]) expect(await changeDuoPin(owner, target, true)).toBe("pinned");
  await setMute(2, 1, true);
  // An incoming mute is private, and does not change what a public profile reveals.
  expect(await pinnedDuoIds(1, [2])).toEqual([2]);
  await setMute(1, 2, true);
  expect(await pinnedDuoIds(1, [2])).toEqual([]);
  expect(await changeDuoPin(1, 2, true)).toBe("unavailable");
  await setMute(1, 2, false);
  expect(await pinnedDuoIds(1, [2])).toEqual([2]);
  await q`UPDATE wp_users SET safety_status='held' WHERE id=3`;
  expect(await pinnedDuoIds(1, [3])).toEqual([]);
  expect(await changeDuoPin(1, 3, true)).toBe("unavailable");

  await setBlock(2, 1, true);
  expect(await duoShortlist(1)).toEqual({ players: [], hasUnavailable: true });
  expect(await changeDuoPin(1, 2, true)).toBe("unavailable");
  await setBlock(2, 1, false);
  expect(await q`SELECT owner_id, player_id FROM wp_duo_shortlist`).toEqual([{ owner_id: 1, player_id: 3 }]);
});

it("lets an owner remove a pin during pause, temporary restriction and stale terms", async () => {
  expect((await update({ playerId: 3, active: true })).status).toBe(200);
  await q`UPDATE wp_users SET banned_until=now()+interval '1 day',terms_version='obsolete' WHERE id=1`;
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "true");
  expect((await update({ playerId: 4, active: true })).status).toBe(403);
  expect((await update({ playerId: 3, active: false })).status).toBe(200);
  expect(await duoShortlist(1)).toEqual({ players: [], hasUnavailable: false });
});

it("keeps the capacity under concurrent pins and recovers space on removal", async () => {
  await q`INSERT INTO wp_duo_shortlist(owner_id,player_id) SELECT 1,id FROM wp_users WHERE id BETWEEN 2 AND ${duoShortlistLimit}`;
  const first = duoShortlistLimit + 1;
  const second = duoShortlistLimit + 2;
  const collision = await Promise.all([changeDuoPin(1, first, true), changeDuoPin(1, second, true)]);
  expect(collision.sort()).toEqual(["full", "pinned"]);
  const pinned = await pinnedDuoIds(1, [first, second]);
  expect(pinned).toHaveLength(1);
  expect((await duoShortlist(1)).players).toHaveLength(duoShortlistLimit);
  expect(await changeDuoPin(1, pinned[0], true)).toBe("pinned");
  expect(await changeDuoPin(1, 2, false)).toBe("removed");
  expect(await changeDuoPin(1, first + second - pinned[0], true)).toBe("pinned");
});

it("clears only the current owner's unavailable pins without changing their safety settings", async () => {
  for (const [owner, player] of [[1, 3], [2, 3], [1, 4]]) expect(await changeDuoPin(owner, player, true)).toBe("pinned");
  await setMute(1, 3, true);
  const view = await duoShortlist(1);
  expect(view.players.map(player => player.id)).toEqual([4]);
  expect(view.hasUnavailable).toBe(true);
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "true");
  expect(await (await update({ action: "clear-unavailable", ownerId: 2 })).json()).toEqual({ ok: true });
  expect(await duoShortlist(1)).toEqual({ players: view.players, hasUnavailable: false });
  expect(await pinnedDuoIds(2, [3])).toEqual([3]);
  expect(await q`SELECT muter_id,muted_id FROM wp_mutes`).toEqual([{ muter_id: 1, muted_id: 3 }]);
});
