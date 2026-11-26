import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupPlayer, playerFromRow, type PlayerSnapshot } from "./riot";

const mocked = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock("./db", () => ({ ...mocked, dbAvailable: () => true }));
const row = (fetched_at: Date) => ({
  platform: "na1",
  puuid: "ref",
  game_name: "Fixture",
  tag_line: "NA1",
  fetched_at,
  snapshot: {
    matches: [],
    champPool: [],
    roles: {},
    kda: 0,
    games: 0,
    wins: 0,
    losses: 0,
  } satisfies PlayerSnapshot,
});
const lookup = () => lookupPlayer("na1", "Fixture", "NA1");
describe("recent-form refresh", () => {
  beforeEach(() => {
    vi.stubEnv("RIOT_API_KEY", "dev-test-only");
    mocked.q.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("repairs incomplete champion aggregates from actual matches in older rows", () => {
    const old = {
      ...row(new Date()),
      snapshot: {
        champPool: [{ champion: "Ashe" }],
        matches: [
          {
            champion: "Ashe",
            matchId: "NA1_1",
            win: true,
            kills: 2,
            deaths: 1,
            assists: 7,
            cs: 65,
            durationSec: 900,
            playedAt: 100,
          },
        ],
      },
    };
    const { snapshot } = playerFromRow(old);
    expect(snapshot.champPool[0]).toMatchObject({ champion: "Ashe", games: 1, kda: 9 });
    expect(snapshot.matches[0].items).toEqual([]);
    expect(playerFromRow({ ...old, snapshot: { matches: null } }).snapshot.games).toBe(0);
  });
  it("serves an existing recent row when the key is missing", async () => {
    vi.stubEnv("RIOT_API_KEY", "");
    mocked.q.mockResolvedValue([row(new Date())]);
    expect(await lookup()).toMatchObject({ ok: true, source: "cache" });
  });
  it("coalesces lookups and preserves a stale row after a failed rank response", async () => {
    mocked.q.mockResolvedValue([row(new Date(0))]);
    const transport = vi.fn(async (url: string) => {
      if (url.includes("/riot/account/"))
        return Response.json({ puuid: "ref", gameName: "Fixture", tagLine: "NA1" });
      if (url.includes("/lol/league/")) return new Response(null, { status: 503 });
      return Response.json(url.includes("/ids?") ? [] : { summonerLevel: 25, profileIconId: 1 });
    });
    vi.stubGlobal("fetch", transport);
    expect(await Promise.all([lookup(), lookup()])).toMatchObject([
      { ok: true, source: "stale" },
      { ok: true, source: "stale" },
    ]);
    expect(mocked.q).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it("reads the actual patch, unambiguous lane opponent and own team's objectives, reusing older matches", async () => {
    const sample = row(new Date(0));
    const legacy = {matchId:"NA1_6", champion:"Ashe", kills:1, deaths:2, assists:3, win:false, cs:80,
      durationSec:1200, playedAt:100, role:"BOTTOM", queueId:420, items:[], baron:true};
    mocked.q.mockResolvedValueOnce([{...sample,snapshot:{...sample.snapshot,matches:[legacy]}}]).mockImplementationOnce(async (_sql, ...args) => {
      const encoded = args[args.length - 2];
      return [{ ...sample, snapshot: JSON.parse(encoded) }];
    });
    const me = { puuid: "ref", championName: "Ashe", teamPosition: "BOTTOM", teamId: 100, kills: 2,
      deaths: 1, assists: 3, totalMinionsKilled: 80, neutralMinionsKilled: 0, goldEarned: 8000, win: true };
    const enemy = { ...me, puuid: "other", teamId: 200, championName: "Jhin", riotIdGameName: "HiddenEnemy" };
    const support = { ...enemy, puuid: "support", teamPosition: "UTILITY", championName: "Leona" };
    const ids = ["NA1_9", "NA1_8", "NA1_7", legacy.matchId];
    const transport = vi.fn(async (url:string) => {
      if (url.includes("/riot/account/")) return Response.json({puuid:"ref",gameName:"Fixture",tagLine:"NA1"});
      if (url.includes("/summoner/")) return Response.json({summonerLevel: 25, profileIconId: 1});
      if (url.includes("/ids?")) return Response.json(ids);
      if (url.includes("/league/v4/")) return Response.json([]);
      const matchId = url.split("/").pop();
      const teams = [{teamId: 200, objectives: {baron: {kills: 5}}}];
      if (matchId !== ids[2]) teams.push({teamId: 100, objectives: {baron: {kills: matchId === ids[0] ? 2 : 0}}});
      return Response.json({metadata:{matchId},info:{gameVersion:"16.22.739.1234",gameDuration:1800,
        gameStartTimestamp:matchId === ids[0] ? 123456 : undefined,gameEndTimestamp:Date.now(),queueId:420,teams,participants: matchId === ids[0] ? [me,enemy,support] :
          [me,enemy,{...enemy,puuid:"third",championName:"Ezreal"}]}});
    });
    vi.stubGlobal("fetch",transport);
    const result = await lookup();
    if (!result.ok) throw Error(result.code);
    const [first,second,third,cached] = result.player.snapshot.matches;
    expect(first).toMatchObject({opponentChampion:"Jhin",gamePatch:"16.22",teamBaronKills:2,startedAt:123456});
    expect(second.startedAt).toBeUndefined();
    expect(cached.startedAt).toBeUndefined();
    expect(second.teamBaronKills).toBe(0);
    expect(third).not.toHaveProperty("teamBaronKills");
    expect(cached).toMatchObject({matchId:legacy.matchId,baron:true});
    expect(cached).not.toHaveProperty("teamBaronKills");
    expect(second.opponentChampion).toBeUndefined();
    expect(JSON.stringify(result.player.snapshot)).not.toContain("HiddenEnemy");
    expect(transport).toHaveBeenCalledTimes(7);
  });
  it("persists both placed queues with the current snapshot and keeps the legacy SQL columns Solo/Duo only", async () => {
    const flex = {queueType:"RANKED_FLEX_SR",tier:"PLATINUM",rank:"I",leaguePoints:84,wins:37,losses:11};
    const recorded: unknown[][] = [];
    mocked.q.mockResolvedValueOnce([]).mockImplementationOnce(async (_sql, ...args) => {
      recorded.push(args);
      return [{...row(new Date()),snapshot:JSON.parse(args.at(-2))}];
    });
    const transport = vi.fn(async (url:string) => {
      if (url.includes("/riot/account/")) return Response.json({puuid:"ref",gameName:"Fixture",tagLine:"NA1"});
      if (url.includes("/summoner/")) return Response.json({summonerLevel:60,profileIconId:3});
      if (url.includes("/league/v4/")) return Response.json([flex]);
      return Response.json([]);
    });
    vi.stubGlobal("fetch",transport);
    expect(await lookup()).toMatchObject({ok:true, player:{rankTier:null,rankedEntries:[flex]}});
    expect(recorded[0].slice(6,11)).toEqual([null,null,null,null,null]);
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it("preserves known good games if a successful ID-list response unexpectedly comes back empty", async () => {
    const previous = row(new Date(0));
    mocked.q.mockResolvedValue([
      { ...previous, snapshot: { ...previous.snapshot, games: 1, wins: 1, kda: 9 } },
    ]);
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/riot/account/"))
        return Response.json({ puuid: "ref", gameName: "Fixture", tagLine: "NA1" });
      return Response.json(url.includes("/summoner/") ? { summonerLevel: 25, profileIconId: 1 } : []);
    });
    expect(await lookup()).toMatchObject({ ok: true, source: "stale", player: { snapshot: { games: 1 } } });
    expect(mocked.q).toHaveBeenCalledTimes(1);
  });
  it("uses a supported account cluster and the Oceania match cluster separately", async () => {
    mocked.q.mockResolvedValue([]);
    const transport = vi.fn(async (url: string) =>
      url.includes("/riot/account/")
        ? Response.json({ puuid: "ref", gameName: "Fixture", tagLine: "OCE" })
        : new Response(null, { status: 503 }),
    );
    vi.stubGlobal("fetch", transport);
    await lookupPlayer("oc1", "Fixture", "OCE");
    const urls = transport.mock.calls.map(([url]) => url);
    expect(urls.some((url) => url.startsWith("https://asia.api.riotgames.com/riot/account/"))).toBe(true);
    expect(urls.some((url) => url.startsWith("https://sea.api.riotgames.com/lol/match/"))).toBe(true);
  });
  it("does not manufacture unranked stats when Riot's ranked endpoint fails", async () => {
    mocked.q.mockResolvedValue([]);
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("/riot/account/")
        ? Response.json({ puuid: "ref", gameName: "Fixture", tagLine: "NA1" })
        : new Response(null, { status: 403 }),
    );
    expect(await lookup()).toEqual({ ok: false, code: "invalid_key" });
    expect(mocked.q).toHaveBeenCalledTimes(1);
  });
});
