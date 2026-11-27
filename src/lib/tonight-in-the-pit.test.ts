import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres, testQueries } from "../../test/postgres";
import { q } from "./db";
import { tonightInThePit } from "./tonight-in-the-pit";
import { renderToStaticMarkup } from "react-dom/server";
import { TonightInThePit } from "../components/tonight-in-the-pit";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
const now = Date.parse("2026-11-26T19:00:00Z");
const day = 86_400_000;
const fetched = new Date(now - 1_000).toISOString();
const game = (id: number, champion: string, win: boolean, daysAgo = 0) => ({
  matchId: `NA1_${id}`, champion, win, playedAt: now - 60_000 - daysAgo * day,
});
async function snapshot(puuid: string, matches: ReturnType<typeof game>[]) {
  await q`UPDATE wp_players SET snapshot=${JSON.stringify({ matches })}::jsonb WHERE puuid=${puuid}`;
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/tonight");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`SELECT 1`;
  await q`INSERT INTO wp_users(id,email,display_name)
    SELECT i,'tonight'||i||'@test.invalid','Tonight '||i FROM generate_series(1,7) i`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,fetched_at)
    SELECT letter,'na1','Riot '||letter,'NA1',${fetched}::timestamptz FROM unnest(ARRAY['a','b','c','d','e','f']) letter`;
  await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES(2,'a',true),(3,'b',true),(4,'c',false),(5,'d',true),(6,'e',true),(7,'e',true)`;
  await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES (1,5)`;
  await q`UPDATE wp_users SET safety_status='held' WHERE id=7`;
  await snapshot("a", [game(21,"Ashe",true),game(21,"Ashe",true),game(22,"Ashe",false,1),game(24,"Ashe",true,8)]);
  await snapshot("b", [game(21,"Nami",false),game(55,"Ashe",true,1)]);
  await snapshot("c", [game(31,"Kennen",true,1)]);
  await snapshot("d", [game(32,"Kennen",true)]);
  await snapshot("e", [game(33,"Kennen",true)]);
  await snapshot("f", [game(34,"Veigar",false,2)]);
}, 30_000);
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

it("counts anonymous unlinked and claimed lookup records while excluding any hidden linked account", async () => {
  const before = testQueries.length;
  expect(await tonightInThePit(1, now)).toEqual({isToday:false, startsAt:now-7*day, matches:5, wins:3, losses:3,
    champion:{id:"Ashe",appearances:3,winRate:67}});
  expect(testQueries.length - before).toBe(1);
  const markup = renderToStaticMarkup(await TonightInThePit({viewerId: 1, now}));
  expect(markup).toContain("10 distinct matches");
  expect(markup).not.toContain("win rate");
  expect(await tonightInThePit(null, now)).toMatchObject({matches:6, wins:4, losses:3});
});

it("switches to the UTC day at ten distinct matches, ignoring earlier games", async () => {
  await snapshot("a", [...Array.from({length:10}, (_,i) => game(21+i,"Ashe",i%2===0)),game(41,"Ashe",true,1)]);
  expect(await tonightInThePit(1, now)).toEqual({isToday:true, startsAt:Date.parse("2026-11-26T00:00:00Z"), matches:10,
    wins:5, losses:6, champion:{id:"Ashe",appearances:10,winRate:50}});
  expect(renderToStaticMarkup(await TonightInThePit({viewerId: 1, now}))).toContain("50% win rate");
});
