import { afterEach, expect, it, vi } from "vitest";
import { readQuestionMatch } from "./question-match";
import { readRiotTimeline } from "./riot";
import { objectiveEvents, readObjectiveTimeline } from "./objective-timeline";

vi.mock("./riot", () => ({readRiotTimeline: vi.fn()}));
vi.mock("./question-match", () => ({readQuestionMatch: vi.fn()}));
const reference = { platform: "na1" as const, riotId: "Player#NA1", matchId: "NA1_50" };
const raw = { metadata:{matchId:"NA1_50",participants:["private-puuid"]}, info:{frames:[{events:[
  {type:"BUILDING_KILL",buildingType:"TOWER_BUILDING",teamId:100,timestamp:660005},
  {type:"ELITE_MONSTER_KILL",monsterType:"DRAGON",killerTeamId:100,timestamp:451790},
  {type:"CHAMPION_KILL",killerId:1,victimId:2,timestamp:451790},
  {type:"ELITE_MONSTER_KILL",monsterType:"HORDE",timestamp:330000},
]}]} };
afterEach(() => vi.clearAllMocks());

it("projects chronological objective times and team attribution without participant IDs", () => {
  expect(objectiveEvents(raw,"NA1_50")).toEqual([
    {seconds:330,objective:"Void Grub"}, {seconds:451,objective:"Dragon",side:"Blue"},
    {seconds:660,objective:"Tower",side:"Red"},
  ]);
  expect(objectiveEvents(raw,"NA1_1")).toBeNull();
  expect(objectiveEvents({...raw,info:{frames:[{}]}},"NA1_50")).toBeNull();
  expect(objectiveEvents({...raw,info:{frames:[{events:[]}]}},"NA1_50")).toEqual([]);
});

it("authorizes each read, coalesces concurrent requests and denies restricted access on a warm hit", async () => {
  vi.mocked(readQuestionMatch).mockResolvedValue({matchId:"NA1_50"} as NonNullable<Awaited<ReturnType<typeof readQuestionMatch>>>);
  vi.mocked(readRiotTimeline).mockResolvedValue({status:200,body:raw});
  const [first, second] = await Promise.all([readObjectiveTimeline(reference,1),readObjectiveTimeline(reference,2)]);
  expect(first.status).toBe("available");
  expect(second).toEqual(first);
  expect(await readObjectiveTimeline(reference,null)).toEqual(first);
  vi.mocked(readQuestionMatch).mockResolvedValue(null);
  expect(await readObjectiveTimeline(reference,3)).toEqual({status:"restricted"});
  expect(readQuestionMatch).toHaveBeenCalledTimes(4);
  expect(readRiotTimeline).toHaveBeenCalledTimes(1);
});

it("distinguishes an unavailable timeline and a vendor cooldown from a game with no objective events", async () => {
  const r = {...reference,matchId:"NA1_52"};
  vi.mocked(readQuestionMatch).mockResolvedValue({matchId:r.matchId} as NonNullable<Awaited<ReturnType<typeof readQuestionMatch>>>);
  vi.mocked(readRiotTimeline).mockResolvedValueOnce({status:429,body:null}).mockResolvedValueOnce({status:502,body:null}).mockResolvedValueOnce({status:404,body:null});
  for (const status of ["limited","unavailable","missing","missing"]) expect(await readObjectiveTimeline(r,1)).toEqual({status});
  expect(readRiotTimeline).toHaveBeenCalledTimes(3);
});
