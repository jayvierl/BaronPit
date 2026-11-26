import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import type { User } from "./auth";
import { searchAll } from "./social";
import { playerStatsHref } from "./platforms";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
vi.mock("./rooms", async original => ({ ...await original<typeof import("./rooms")>(), listRooms: async () => [] }));
beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/search");
  await q`SELECT 1`;
  await postgres.exec(`INSERT INTO wp_users(id,email,display_name) VALUES
    (1,'searcher@example.invalid','Searcher'),(2,'one@example.invalid','Écho River'),(3,'two@example.invalid','Écho River');
    UPDATE wp_users SET avatar_ref='{"kind":"champion","id":"Nami"}'::jsonb WHERE id=2;
    UPDATE wp_users SET avatar_ref='{"kind":"champion","id":"Ashe"}'::jsonb WHERE id=3;
    INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (3,1);
    INSERT INTO wp_players(puuid,platform,game_name,tag_line) VALUES
      ('echo1','na1','Écho River','NA1'),('echo2','euw1','Écho River','WAVE');`);
}, 30_000);
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

it("keeps duplicate names on their own platform and treats a full Riot ID as a player lookup", async () => {
  const results = await searchAll("Écho River", { id: 1 } as User);
  expect(results.users.map(person => [person.id, person.avatar])).toEqual([[2, {kind:"champion", id:"Nami"}]]);
  expect(results.players.map(p => [p.riotId, p.platform])).toEqual([["Écho River#WAVE", "euw1"], ["Écho River#NA1", "na1"]]);
  const exact = await searchAll("Écho River#wave", null);
  expect(exact.users).toEqual([]);
  expect(exact.players).toHaveLength(1);
  const url = new URL(playerStatsHref(exact.players[0].platform, exact.players[0].riotId), "https://example.invalid");
  expect(url.pathname).toBe("/player");
  expect(url.searchParams.get("riotId")).toBe("Écho River#WAVE");
  expect(url.searchParams.get("platform")).toBe("euw1");
  expect((await searchAll("#NA1", null)).players).toEqual([]);
});
