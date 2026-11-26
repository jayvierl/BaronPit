import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { postgres, testQueries } from "../../test/postgres";
import { q } from "./db";
import { listFeaturedRooms } from "./rooms";
import { PATCH_NOTES_INDEX, PATCH_PUBLISHER } from "./patch-notes";
import { readPosts } from "./post-reader";
import { publicProfile, linkedPlayers, linkedPlayerIdentities, trendingChampions, championRoomPulse } from "./player-insights";
import { ensureRooms, getRoom, listRooms, runPatchWatch, searchAll, todaysSpotlight } from "./social";
import { summarize, type MatchSummary } from "./pure";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
let patch = "16.23.1";
vi.mock("./riot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./riot")>()),
  confirmedPatch: async () => patch,
  championCatalog: async () => ({
    patch,
    current: true,
    list: [{ id: "Ashe", name: "Ashe", title: "", tags: [] }],
  }),
}));

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/stats");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`SELECT 1`;
  const games: MatchSummary[] = Array.from({ length: 20 }, (_, i) => ({
    matchId: "NA1_" + i,
    champion: i < 12 ? "Ashe" : "Lux",
    win: i % 2 === 0,
    kills: 5,
    deaths: 3,
    assists: 8,
    cs: 172,
    durationSec: 1700,
    queueId: 420,
    role: "BOTTOM",
    playedAt: 1700000000000 + i,
    items: [1055, 3006, 3031, 6672],
    teammates: Array.from({ length: 4 }, (_, i) => ({ name: "Teammate " + i, tag: "NA1", champion: "Ahri" })),
  }));
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,snapshot)
    SELECT 'player-'||i,'na1','Player '||i,'NA1',${JSON.stringify(summarize(games))}::jsonb FROM generate_series(1,200) AS i`;
  await postgres.exec(`INSERT INTO wp_users(email,display_name) VALUES ('a@sample.invalid','Viewer'),('b@sample.invalid','Author');
    INSERT INTO wp_links(user_id,puuid,is_primary) VALUES (2,'player-1',TRUE),(2,'player-2',FALSE);`);
}, 30_000);
afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bounded player and community data queries", () => {
  it("returns aggregate rows, with the same chart totals, at a fraction of the original transfer", async () => {
    const old = await q`SELECT snapshot FROM wp_players WHERE snapshot <> '{}'::jsonb LIMIT 200`;
    const trends = await trendingChampions();
    const pulse = await championRoomPulse("Ashe");
    expect(trends).toEqual([
      { champion: "Ashe", games: 2400 },
      { champion: "Lux", games: 1600 },
    ]);
    expect(pulse).toMatchObject({ players: 200, games: 2400, wins: 1200 });
    expect(pulse.topPlayers).toHaveLength(5);
    expect(await championRoomPulse("Zed")).toEqual({ players: 0, games: 0, wins: 0, topPlayers: [] });
    const oldBytes = Buffer.byteLength(JSON.stringify(old));
    const trendBytes = Buffer.byteLength(JSON.stringify(trends));
    expect(trendBytes * 10).toBeLessThan(oldBytes);
    if (process.env.MEASURE_QUERY_BYTES === "1")
      console.info("Trending fixture transfer", { players: 200, gamesPerPlayer: 20, oldBytes, trendBytes });
    const before = testQueries.length;
    await trendingChampions();
    expect(testQueries.length).toBe(before);
  });
  it("loads linked players in primary order in one trip", async () => {
    const start = testQueries.length;
    expect((await linkedPlayers(2)).map((p) => p.puuid)).toEqual(["player-1", "player-2"]);
    expect(testQueries.length - start).toBe(1);
  });
  it("keeps account settings and picture choices in the same order without transferring match histories", async () => {
    const full = await linkedPlayers(2);
    const start = testQueries.length;
    const identities = await linkedPlayerIdentities(2);
    expect(testQueries.length - start).toBe(1);
    expect(identities).toEqual(full.map(p => ({
      puuid:p.puuid, platform:p.platform, gameName:p.gameName, tagLine:p.tagLine, profileIcon:p.profileIcon,
      primary:p.primary, verified:p.verified, rankTier:p.rankTier, rankDiv:p.rankDiv, rankLp:p.rankLp, rankedEntries:p.rankedEntries, fetchedAt:p.fetchedAt,
    })));
    expect(JSON.stringify(identities).length * 10).toBeLessThan(JSON.stringify(full).length);
  });
  it("pins one verified spotlight across viewers, serves a slim profile badge, and rechecks safety live", async () => {
    const day = "2026-11-26";
    expect(await todaysSpotlight(day, 1)).toBeNull(); // Lookup claims do not prove ownership.
    await q`UPDATE wp_links SET verified=true WHERE user_id=2 AND puuid='player-1'`;
    const start = testQueries.length;
    expect(await todaysSpotlight(day, 1)).toMatchObject({ ownerId: 2, verified: true });
    expect(await publicProfile(2, 1, day)).toMatchObject({ featured: true });
    expect(testQueries.length - start).toBe(2);
    // A later arrival cannot displace the winner or become a substitute when blocked.
    await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES(1,'player-3',true)`;
    expect(await publicProfile(1, null, day)).toMatchObject({ featured: false });
    await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES(1,2)`;
    expect(await publicProfile(2, 1, day)).toMatchObject({ featured: false });
    expect(await todaysSpotlight(day, 1)).toBeNull();
    expect(await todaysSpotlight(day)).toMatchObject({ ownerId: 2 });
    await q`DELETE FROM wp_mutes WHERE muter_id=1 AND muted_id=2`;
    await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(2,1)`;
    expect(await publicProfile(2, 1, day)).toBeNull();
    expect(await todaysSpotlight(day, 1)).toBeNull();
    await q`UPDATE wp_users SET safety_status='held' WHERE id=2`;
    expect(await publicProfile(2, null, day)).toBeNull();
    expect(await todaysSpotlight(day)).toBeNull();
    await q`UPDATE wp_users SET safety_status='visible',banned_until=now()+interval '1 day' WHERE id=2`;
    expect(await todaysSpotlight(day)).toBeNull();
    expect(await publicProfile(2, null, day)).toBeNull();
    await q`UPDATE wp_users SET banned_until=null WHERE id=2`;
    await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES(1,'player-1',true)`;
    expect(await todaysSpotlight(day)).toBeNull();
    expect(await publicProfile(2, null, day)).toMatchObject({ featured: false });
    await q`DELETE FROM wp_links WHERE user_id=2 AND puuid='player-1'`;
    expect(await todaysSpotlight(day)).toBeNull();
    expect(await todaysSpotlight("2026-11-27")).toMatchObject({ ownerId: 1 });
    const slots = await q`SELECT day FROM wp_daily_spotlight`;
    expect(slots).toHaveLength(1);
  });
  it("uses the same Riot fields for profile and feed flair even on older sparse snapshots", async () => {
    await q`INSERT INTO wp_users(id,email,display_name) VALUES (500,'flair@example.invalid','Flair')`;
    await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,rank_div) VALUES ('flair','na1','Flair','NA1','GOLD','IV')`;
    await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES (500,'flair',true)`;
    const [post] = await q`INSERT INTO wp_posts(author_id,kind,body) VALUES (500,'text','My post') RETURNING id`;
    for (const [snapshot,expected] of [
      [{ champPool:[{ champion:"Ashe" }] }, "Gold IV · Ashe main"],
      [{ champPool:[] }, "Gold IV"], [{}, "Gold IV"], [{ champPool:[{ champion:{name:"Ashe"} }] }, "Gold IV"],
    ] as const) {
      await q`UPDATE wp_players SET snapshot=${JSON.stringify(snapshot)}::jsonb WHERE puuid='flair'`;
      expect((await linkedPlayers(500))[0].flair).toBe(expected);
      expect((await readPosts(null,{postId:Number(post.id)},1))[0].authorFlair).toBe(expected);
    }
    const flex = {queueType:"RANKED_FLEX_SR", tier:"EMERALD", rank:"II", leaguePoints:77, wins:12, losses:5};
    await q`UPDATE wp_players SET rank_tier=NULL,rank_div=NULL WHERE puuid='flair'`;
    for (const [snapshot, expected] of [
      [{ rankedEntries:[flex] }, "Emerald II (Flex)"],
      [{ rankedEntries:[] }, "Unranked"],
      [{}, "Rank unavailable"],
    ] as const) {
      await q`UPDATE wp_players SET snapshot=${JSON.stringify(snapshot)}::jsonb WHERE puuid='flair'`;
      expect((await linkedPlayers(500))[0].flair).toBe(expected);
      const [byline] = await readPosts(null, {postId:Number(post.id)}, 1);
      expect(byline).toMatchObject({authorFlair:expected, authorStatsHref:"/player?platform=na1&riotId=Flair%23NA1"});
      expect((await searchAll("Flair#NA1", null)).players).toMatchObject([{rank:expected}]);
    }
    await q`UPDATE wp_players SET snapshot=${JSON.stringify({ rankedEntries: [flex] })}::jsonb, fetched_at='2024-12-31T23:59:00Z' WHERE puuid='flair'`;
    const dated = "Emerald II (Flex) · as of Dec 31, 2024";
    expect((await linkedPlayers(500))[0].flair).toBe(dated);
    expect((await readPosts(null,{postId:Number(post.id)},1))[0]).toMatchObject({authorFlair:dated,authorTier:"EMERALD"});
    await q`DELETE FROM wp_users WHERE id=500`;
  });
  it("keeps one membership read scoped to the requested room", async () => {
    await ensureRooms();
    const room = await getRoom("champ-ashe", 1);
    expect(room?.joined).toBe(false);
    await q`INSERT INTO wp_room_members(user_id,room_id) VALUES (1,${room!.id})`;
    expect(await getRoom("champ-ashe", 1)).toMatchObject({ members: 1, joined: true });
    expect(await listRooms(undefined, 2)).toHaveLength(2);
  });
  it("features four broad rooms, shows only consenting public host assignments, and hides held rooms", async () => {
    vi.stubEnv("PUBLIC_ROOM_HOSTS", '{"general":2,"new-players":"bogus"}');
    await q`UPDATE wp_users SET age_band='adult' WHERE id=2`;
    const rooms = await listFeaturedRooms();
    expect(rooms.map(room => room.slug)).toEqual(["new-players","off-meta-lab","patch-meta","general"]);
    expect(rooms.find(room => room.slug === "general")?.host).toEqual({id:2,name:"Author"});
    expect((await listFeaturedRooms(1)).find(room => room.slug === "general")?.host).toBeNull();
    await q`UPDATE wp_users SET safety_status='held' WHERE id=2`;
    expect((await listFeaturedRooms()).find(room => room.slug === "general")?.host).toBeNull();
    await q`UPDATE wp_users SET safety_status='visible' WHERE id=2`;
    await q`UPDATE wp_rooms SET safety_status='held' WHERE slug='new-players'`;
    expect(await getRoom("new-players")).toBeNull();
    expect((await listFeaturedRooms()).map(room => room.slug)).not.toContain("new-players");
  });
  it("repairs legacy briefings without losing room conversations or crowding a new player question out of the global feed", async () => {
    await q`INSERT INTO wp_users(email,display_name) VALUES (${PATCH_PUBLISHER},'Publisher')`;
    const bad = "https://www.leagueoflegends.com/en-us/news/game-updates/patch-16-23-notes/";
    const article = "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-23-notes/";
    await q`INSERT INTO wp_posts(author_id,kind,room_id,body) SELECT 1,'text',id,'What should I buy?' FROM wp_rooms WHERE slug='general'`;
    await q`INSERT INTO wp_posts(author_id,kind,room_id,body,data)
      SELECT u.id,'text',r.id,${bad},'{"briefing":true,"patch":"16.23.1"}'::jsonb
      FROM wp_users u CROSS JOIN wp_rooms r WHERE u.email=${PATCH_PUBLISHER}`;
    const [dupe] = await q`INSERT INTO wp_posts(author_id,kind,room_id,body,data)
      SELECT author_id,kind,room_id,body,data FROM wp_posts WHERE room_id=(SELECT id FROM wp_rooms WHERE slug='patch-meta') RETURNING id`;
    const publicFeed = await readPosts(null,{},2);
    expect(publicFeed).toHaveLength(2);
    expect(publicFeed.map(post => post.body)).toContain("What should I buy?");
    expect(publicFeed.filter(post => post.data.briefing)).toHaveLength(1);
    expect(publicFeed[0]).toMatchObject({roomSlug:"patch-meta",data:{notesUrl:article}});
    expect(publicFeed[0].id).not.toBe(Number(dupe.id));
    const champ = (await getRoom("champ-ashe"))!;
    const [local] = await readPosts(null,{roomId:champ.id},10);
    expect(local.body).toContain("Ashe");
    expect(local.data.notesUrl).toBe(article);
    await q`INSERT INTO wp_comments(author_id,post_id,body) VALUES (1,${local.id},'Reply from earlier')`;
    expect((await readPosts(null,{postId:local.id},1))[0].commentCount).toBe(1);
    const [fake] = await q`INSERT INTO wp_posts(author_id,kind,room_id,body,data)
      VALUES (1,'text',${champ.id},'My discussion','{"briefing":true,"patch":"16.23.1"}') RETURNING id`;
    expect((await readPosts(null,{},10)).find(post => post.id===Number(fake.id))).toMatchObject({body:"My discussion",data:{}});
    expect(await runPatchWatch()).toMatchObject({ changed: false, briefings: 0 });
    expect((await q`SELECT body,data FROM wp_posts WHERE id=${local.id}`)[0]).toMatchObject({body:article,data:{notesUrl:article}});
  });
  it("resurfaces a discussion only for recent peer replies visible to this reader", async () => {
    const [question] = await q`INSERT INTO wp_posts(author_id,kind,body,created_at)
      VALUES (1,'text','Earlier match question',now()-interval '14 days') RETURNING id`;
    const [self] = await q`INSERT INTO wp_comments(author_id,post_id,body) VALUES(1,${question.id},'Me again') RETURNING id`;
    expect((await readPosts(null,{activeReplies:true},1))[0].id).not.toBe(question.id);
    const replies = await q`INSERT INTO wp_comments(author_id,post_id,body,parent_id,created_at) VALUES
      (2,${question.id},'A useful reply',${self.id},now()),(2,${question.id},'A second reply',${self.id},now()) RETURNING id`;
    const latest = Math.max(...replies.map(reply => Number(reply.id)));
    expect((await readPosts(null,{activeReplies:true},1))[0]).toMatchObject({id:question.id,lastReplyAt:expect.any(String),lastReplyId:latest});
    // Users 1 and 2 have a bidirectional block in the fixture.
    expect((await readPosts(1,{activeReplies:true},1))[0].id).not.toBe(question.id);
    await q`UPDATE wp_comments SET status='held' WHERE id=${self.id}`;
    expect((await readPosts(null,{activeReplies:true},1))[0].id).not.toBe(question.id);
  });
  it("publishes one briefing atomically, retries, and ignores new rooms, data hotfixes and stale versions", async () => {
    vi.stubGlobal("fetch",vi.fn(async () => new Response("not found", {status:404})));
    patch = "16.24.1";
    await postgres.exec("ALTER TABLE wp_posts ADD CONSTRAINT fixture_failure CHECK (NOT (data ? 'briefing')) NOT VALID");
    await expect(runPatchWatch()).rejects.toThrow();
    expect((await q`SELECT value FROM wp_meta WHERE key='last_patch'`)[0].value).toBe("16.23.1");
    await postgres.exec("ALTER TABLE wp_posts DROP CONSTRAINT fixture_failure");
    const runs = await Promise.all([runPatchWatch(),runPatchWatch()]);
    expect(runs.map(run=>run.briefings).sort()).toEqual([0,1]);
    expect(runs.filter(run=>run.changed)).toHaveLength(1);
    expect((await readPosts(null,{},1))[0]).toMatchObject({roomSlug:"patch-meta",data:{notesUrl:PATCH_NOTES_INDEX}});
    await q`INSERT INTO wp_rooms(slug,name,kind) VALUES ('new-room','New Room','general')`;
    expect(await runPatchWatch()).toMatchObject({ changed: false, briefings: 0 });
    patch = "16.24.2";
    expect(await runPatchWatch()).toMatchObject({ changed: true, briefings: 0 });
    patch = "16.22.1";
    expect(await runPatchWatch()).toMatchObject({ changed: false, briefings: 0 });
    expect((await q`SELECT count(*)::int AS n FROM wp_posts WHERE data->>'patch' LIKE '16.24.%'`)[0].n).toBe(1);
  });
});
