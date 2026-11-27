import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupPlayer, playerFromRow, type PlayerSnapshot } from "./riot";
import { rankedMatchFixture } from "../../test/ranked-match";

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
const profile = (force = false) => lookupPlayer("na1", "Fixture", "NA1", { profile: true, force });
let fixtureKey = 0;
describe("recent-form refresh", () => {
  beforeEach(() => {
    vi.stubEnv("RIOT_API_KEY", `dev-fixture-${++fixtureKey}`);
    mocked.q.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
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
            champion: "Ashe", queueId:420,
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
  it("reports unavailable saved records during a storage outage with no Riot call", async () => {
    mocked.q.mockRejectedValue(new Error("fixture storage outage"));
    const transport = vi.fn();
    vi.stubGlobal("fetch",transport);
    expect(await lookup()).toEqual({ok:false,code:"unavailable"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("uses each match's own routing cluster for a player's cross-region history", async () => {
    mocked.q.mockResolvedValueOnce([]).mockImplementationOnce(async (_sql, ...args) => [{
      ...row(new Date()), snapshot: JSON.parse(args[11]),
    }]);
    const ids = ["EUW1_11","NA1_12","OC1_13"];
    const detailRegions: string[] = [];
    const transport = vi.fn(async (url: string) => {
      if (url.includes("/riot/account/")) return Response.json({puuid:"ref",gameName:"Fixture",tagLine:"NA1"});
      if (url.includes("/summoner/")) return Response.json({summonerLevel:32,profileIconId:1});
      if (url.includes("/league/")) return Response.json([]);
      if (url.includes("/ids?")) return Response.json(ids);
      const path = new URL(url);
      const matchId = path.pathname.split("/").at(-1)!;
      detailRegions.push(`${matchId}:${path.hostname.split(".")[0]}`);
      return Response.json({metadata:{matchId},info:{gameDuration:1800,gameEndTimestamp:Date.now(),queueId:420,
        participants:[{puuid:"ref",championName:"Ashe",win:true,kills:2,deaths:1,assists:4,totalMinionsKilled:100,neutralMinionsKilled:0}]}});
    });
    vi.stubGlobal("fetch",transport);
    expect(await lookup()).toMatchObject({ok:true,source:"live",player:{snapshot:{matches:ids.map(matchId=>({matchId}))}}});
    expect(detailRegions).toEqual(["EUW1_11:europe","NA1_12:americas","OC1_13:sea"]);
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
    const played = {matchId:"NA1_1",champion:"Ashe",win:true,kills:5,deaths:1,assists:4,cs:20,durationSec:900,playedAt:100};
    mocked.q.mockResolvedValue([
      { ...previous, snapshot: { ...previous.snapshot, matches:[{...played,queueId:420}] } },
    ]);
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/riot/account/"))
        return Response.json({ puuid: "ref", gameName: "Fixture", tagLine: "NA1" });
      return Response.json(url.includes("/summoner/") ? { summonerLevel: 25, profileIconId: 1 } : []);
    });
    expect(await lookup()).toMatchObject({ ok: true, source: "stale", player: { snapshot: { games: 1 } } });
    expect(mocked.q).toHaveBeenCalledTimes(1);
    mocked.q.mockResolvedValue([{...previous,snapshot:{...previous.snapshot,matches:[{...played,queueId:0}]}}]);
    expect(await lookup()).toMatchObject({ok:true,source:"stale",player:{snapshot:{games:0}}});
    expect(mocked.q).toHaveBeenCalledTimes(2);
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
  it("shows successful public data without persisting an incomplete newcomer lookup", async () => {
    mocked.q.mockResolvedValue([]);
    const ranked = [{queueType:"RANKED_SOLO_5x5", tier:"GOLD", rank:"II", leaguePoints:30, wins:10, losses:3}];
    const me = {puuid:"ref", championName:"Ashe", teamId:100, win:true, kills:2, deaths:1, assists:4,
      totalMinionsKilled:100, neutralMinionsKilled:0, goldEarned:8500, teamPosition:"BOTTOM"};
    const transport = vi.fn(async (url: string) => {
      if (url.includes("/riot/account/")) return Response.json({puuid:"ref", gameName:"Fixture", tagLine:"NA1"});
      if (url.includes("/summoner/")) return Response.json({summonerLevel:32, profileIconId:1});
      if (url.includes("/league/")) return Response.json(ranked);
      if (url.includes("/ids?")) return Response.json(["NA1_5", "NA1_4", "NA1_3", "NA1_2", "NA1_1"]);
      if (url.endsWith("NA1_5")) return Response.json({metadata:{matchId:"NA1_5"},
        info:{gameDuration:1400, gameEndTimestamp:Date.now(), queueId:420, participants:[me]}});
      return new Response(null,{status:503});
    });
    vi.stubGlobal("fetch", transport);
    expect(await lookup()).toMatchObject({ok:true, source:"partial", fresh:false, player:{rankedEntries:ranked, snapshot:{games:1}}});
    expect(mocked.q).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls.some(([url]) => url.endsWith("NA1_1"))).toBe(false);
  });
  it("returns a ranked-only snapshot when the Match-V5 list is unavailable", async () => {
    mocked.q.mockResolvedValue([]);
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/riot/account/")) return Response.json({puuid:"ref", gameName:"Fixture", tagLine:"NA1"});
      if (url.includes("/summoner/")) return Response.json({summonerLevel:32, profileIconId:1});
      if (url.includes("/league/")) return Response.json([]);
      return new Response(null,{status:503});
    });
    expect(await lookup()).toMatchObject({ok:true, source:"partial", fresh:false, player:{rankedEntries:[], snapshot:{games:0}}});
    expect(mocked.q).toHaveBeenCalledTimes(1);
  });

  it("reads fresh public scoreboard details and independent top mastery without exposing hidden identity fields", async () => {
    mocked.q.mockResolvedValueOnce([]).mockImplementationOnce(async (_sql, ...args) => [{
      ...row(new Date()), snapshot: JSON.parse(args[11]),
    }]);
    const me = { puuid:"ref", championName:"Ashe", teamId:100, win:true, kills:3, deaths:1, assists:7,
      totalMinionsKilled:100, neutralMinionsKilled:15, goldEarned:8500, teamPosition:"BOTTOM", champLevel:12,
      item0:3085,item2:3031,item6:3340,summoner1Id:4,summoner2Id:7,
      perks:{styles:[{description:"subStyle",style:8400,selections:[{perk:8473}]},
        {description:"primaryStyle",style:8000,selections:[{perk:8005},{perk:9104}]}]},
    };
    const heroes = ["Ahri","Darius","LeeSin","Nami","Draven","Lux","Garen","Amumu","Morgana"];
    const others = heroes.map((championName,index) => ({ ...me, championName, teamId:index < 4 ? 100 : 200,
      puuid:`never-serialize-${index}`, kills: index < 4 ? 5 : 2, teamPosition: index === 4 ? "BOTTOM" : "UTILITY",
      riotIdGameName:index === 4 ? "Enemy" : index === 5 ? "HiddenAlias" : undefined,
      riotIdTagline:index === 4 ? "NA1" : undefined,
    }));
    const transport = vi.fn(async (url:string) => {
      if (url.includes("/riot/account/")) return Response.json({puuid:"ref",gameName:"Fixture",tagLine:"NA1"});
      if (url.includes("/summoner/")) return Response.json({summonerLevel:32,profileIconId:1});
      if (url.includes("/league/")) return Response.json([]);
      if (url.includes("/ids?")) return Response.json(["NA1_17"]);
      if (url.includes("/champion-mastery/")) return Response.json([
        {championId:22,championPoints:125_000,championLevel:14,puuid:"do-not-store"},
        {championId:888,championPoints:272_130,championLevel:21},
      ]);
      return Response.json({metadata:{matchId:"NA1_17"},info:{gameDuration:1_700,gameEndTimestamp:Date.now(),
        queueId:420,participants:[me,...others],teams:[{teamId:100,objectives:{champion:{kills:20}}}]}});
    });
    vi.stubGlobal("fetch",transport);
    const result = await profile();
    expect(result).toMatchObject({ ok:true, source:"live", player:{
      championMastery:{ fetchedAt:expect.any(String), champions:[{championId:888,points:272_130,level:21}, {championId:22,points:125_000,level:14}] },
      matchHistory:{complete:true},snapshot:{games:1,matches:[{
        championLevel:12,spellIds:[4,7],runes:{keystone:8005,primaryStyle:8000,secondaryStyle:8400},
        teamKills:20,killParticipation:.5,items:[3085,3031,3340],opponentChampion:"Draven",
        teams:{allies:expect.arrayContaining([{champion:"Ashe",isPlayer:true}]),opponents:expect.arrayContaining([{champion:"Draven",name:"Enemy",tag:"NA1"},{champion:"Lux"}])},
      }]},
    } });
    expect(JSON.stringify(result)).not.toMatch(/HiddenAlias|never-serialize-|do-not-store/);
    expect(transport.mock.calls.find(([url]) => url.includes("/champion-mastery/"))?.[0]).toContain("/by-puuid/ref/top?count=8");
  });

  it("preserves the prior mastery observation if optional mastery fails without blocking a fresh profile", async () => {
    const previous = { fetchedAt:new Date(0).toISOString(), champions:[{championId:888,points:272_130,level:21}] };
    const cached = row(new Date(0));
    mocked.q.mockResolvedValueOnce([{...cached,snapshot:{...cached.snapshot,championMastery:previous}}])
      .mockImplementationOnce(async (_sql, ...args) => [{...cached, snapshot:JSON.parse(args[11])}]);
    vi.stubGlobal("fetch", async (url:string) => {
      if (url.includes("/riot/account/")) return Response.json({puuid:"ref",gameName:"Fixture",tagLine:"NA1"});
      if (url.includes("/summoner/")) return Response.json({summonerLevel:32,profileIconId:1});
      return url.includes("/champion-mastery/") ? new Response(null,{status:503}) : Response.json([]);
    });
    expect(await profile()).toMatchObject({ok:true,source:"live",player:{championMastery:previous,matchHistory:{complete:true}}});
  });

  it("publishes a full recent 20 when an older request is throttled, then fills to 100 without repeating known matches", async () => {
    vi.useFakeTimers({toFake:["Date","setTimeout","clearTimeout"]});
    const ids = Array.from({length:100},(_, index) => `NA1_${500-index}`);
    const transfers: string[] = [];
    let stored: Record<string, unknown> | undefined;
    let persistedCooldown: string | undefined;
    let blockOlder = true;
    mocked.q.mockImplementation(async (strings: TemplateStringsArray, ...args) => {
      const sql = strings.join(" ");
      if (sql.includes("AS riot_retry_at")) return stored || persistedCooldown ? [{...stored,riot_retry_at:persistedCooldown}] : [];
      if (sql.includes("ARRAY[]::timestamptz[]")) { persistedCooldown = args[1]; return []; }
      if (sql.includes("INSERT INTO wp_action_windows")) return [{bucket:args[0]}];
      stored = {...row(new Date(args[12])), snapshot:JSON.parse(args[11])};
      return [stored];
    });
    vi.stubGlobal("fetch", async (url:string) => {
      if (url.includes("/riot/account/")) return Response.json({puuid:"ref",gameName:"Fixture",tagLine:"NA1"});
      if (url.includes("/summoner/")) return Response.json({summonerLevel:32,profileIconId:1});
      if (url.includes("/league/") || url.includes("/champion-mastery/")) return Response.json([]);
      if (url.includes("/ids?")) { expect(url).toContain("count=100"); return Response.json(ids); }
      const matchId = url.split("/").at(-1)!;
      transfers.push(matchId);
      if (blockOlder && matchId === ids[20]) return new Response(null,{status:429,headers:{"Retry-After":"125"}});
      return Response.json({metadata:{matchId},info:{gameDuration:1700,gameEndTimestamp:Date.now(),queueId:420,
        participants:[{puuid:"ref",championName:"Ashe",teamId:100,win:true,kills:3,deaths:1,assists:7,
          totalMinionsKilled:100,neutralMinionsKilled:15,teamPosition:"BOTTOM"}]}});
    });
    const initial = profile();
    await vi.runAllTimersAsync();
    const first = await initial;
    if (!first.ok) throw new Error(first.code);
    expect(first).toMatchObject({source:"live",player:{snapshot:{games:20},matchHistory:{complete:false}}});
    expect(first.player.snapshot.matches.map(match => match.matchId)).toEqual(ids.slice(0,20));
    expect(first.player.matchHistory?.matches.some(match => match.matchId === ids[21])).toBe(true);
    expect(transfers).toEqual(ids.slice(0,24));
    expect(first.retryAt).toBe(persistedCooldown);
    expect(await profile(true)).toMatchObject({source:"cache",retryAt:persistedCooldown});
    expect(transfers).toHaveLength(24);

    blockOlder = false;
    vi.setSystemTime(new Date(Date.parse(persistedCooldown!) + 10));
    const continuation = profile(true);
    await vi.runAllTimersAsync();
    const second = await continuation;
    if (!second.ok) throw new Error(second.code);
    expect(second.player.matchHistory?.matches.map(match => match.matchId)).toEqual(ids);
    expect(second.player.matchHistory?.complete).toBe(true);
    expect(second.player.snapshot.matches).toHaveLength(20);
    expect(transfers.slice(24)).toEqual([ids[20],...ids.slice(24)]);
    expect((stored?.snapshot as Record<string, unknown>).olderMatches).toHaveLength(80);
  });

  it("honors a shared Riot retry window even when a cold worker has no cached profile", async () => {
    const until = new Date(Date.now()+60_000).toISOString();
    mocked.q.mockResolvedValue([{riot_retry_at:until}]);
    const transport = vi.fn();
    vi.stubGlobal("fetch",transport);
    expect(await profile(true)).toEqual({ok:false,code:"rate_limited",retryAt:until});
    expect(transport).not.toHaveBeenCalled();
  });

  it("upgrades four recent saved ranked games per stale profile refresh without retrying unscorable evidence", async () => {
    vi.useFakeTimers({toFake:["Date","setTimeout","clearTimeout"]});
    const ids = Array.from({length:8}, (_, i) => `NA1_${100 - i}`);
    const cached = row(new Date(0));
    let stored: Record<string, unknown> = { ...cached, snapshot: { ...cached.snapshot, matches: ids.map((matchId, i) => ({
      matchId, champion:"Nami", win:true, kills:2, deaths:4, assists:1, cs:10, durationSec:1800, playedAt:2_000_000,
      role:"UTILITY", queueId:i === 0 ? 450 : 420, items:[], detailsVersion:1,
    })) } };
    mocked.q.mockImplementation(async (strings: TemplateStringsArray, ...args) => {
      const sql = strings.join(" ");
      if (sql.includes("AS riot_retry_at")) return [stored];
      if (sql.includes("INSERT INTO wp_action_windows")) return [{bucket:args[0]}];
      stored = { ...cached, fetched_at:new Date(args[12]), snapshot:JSON.parse(args[11]) };
      return [stored];
    });
    const details: string[] = [];
    let failOne = true;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/riot/account/")) return Response.json({puuid:"ref",gameName:"Fixture",tagLine:"NA1"});
      if (url.includes("/summoner/")) return Response.json({summonerLevel:32,profileIconId:1});
      if (url.includes("/league/") || url.includes("/champion-mastery/")) return Response.json([]);
      if (url.includes("/ids?")) return Response.json(ids);
      const matchId = url.split("/").at(-1)!;
      details.push(matchId);
      if (failOne && matchId === ids[3]) return new Response(null,{status:503});
      const game = rankedMatchFixture(matchId,"ref");
      if (matchId === ids[2]) game.info.participants[9].gameEndedInEarlySurrender = true;
      return Response.json(game);
    });
    const first = await profile(true);
    if (!first.ok) throw new Error(first.code);
    const matches = first.player.snapshot.matches;
    expect(details).toEqual(ids.slice(1,5));
    expect(matches[1]).toMatchObject({performanceRating:5.5,detailsVersion:3});
    expect(matches[2]).toMatchObject({performanceRating:undefined,detailsVersion:3});
    expect(matches[3]).toMatchObject({matchId:ids[3],detailsVersion:1,kills:2});
    expect(await profile(true)).toMatchObject({source:"cache"});
    expect(details).toHaveLength(4);
    failOne = false;
    // The pre-existing Update button can refresh rank early. Rating upgrades wait for a stale window.
    vi.advanceTimersByTime(3 * 60_000);
    expect(await profile(true)).toMatchObject({source:"live"});
    expect(details).toHaveLength(4);
    vi.advanceTimersByTime(11 * 60_000);
    expect(await profile(true)).toMatchObject({source:"live"});
    expect(details.slice(4)).toEqual([ids[3],...ids.slice(5)]);
    vi.advanceTimersByTime(11 * 60_000);
    expect(await profile(true)).toMatchObject({source:"live"});
    expect(details).toHaveLength(8);
  });
});
