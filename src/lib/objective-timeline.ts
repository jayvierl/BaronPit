import type { MatchReference } from "./match-context";
import { readQuestionMatch } from "./question-match";
import { readRiotTimeline } from "./riot";

const monsters = new Map([
  ["BARON_NASHOR", "Baron Nashor"], ["DRAGON", "Dragon"], ["RIFTHERALD", "Rift Herald"],
  ["HORDE", "Void Grub"], ["ATAKHAN", "Atakhan"],
]);
type Moment = { seconds: number; objective: string; side?: "Blue" | "Red" };
type Result = { status: "available"; events: Moment[]; observedAt: string } |
  { status: "restricted" | "limited" | "missing" | "unavailable" };
const cache = new Map<string, { until: number; result: Result }>();
const pending = new Map<string, Promise<Result>>();

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function objectiveEvents(raw: unknown, matchId: string): Moment[] | null {
  const body = object(raw);
  const frames = object(body.info).frames;
  if (object(body.metadata).matchId !== matchId || !Array.isArray(frames) || !frames.length) return null;
  const moments: Moment[] = [];
  for (const frame of frames) {
    const events = object(frame).events;
    if (!Array.isArray(events)) return null;
    for (const rawEvent of events) {
      const event = object(rawEvent);
      let objective: string | undefined;
      let team = event.killerTeamId;
      if (event.type === "ELITE_MONSTER_KILL") objective = monsters.get(String(event.monsterType));
      if (event.type === "BUILDING_KILL") {
        if (event.buildingType === "TOWER_BUILDING") objective = "Tower";
        if (event.buildingType === "INHIBITOR_BUILDING") objective = "Inhibitor";
        // On a building event teamId is the owner of the destroyed structure.
        if (team !== 100 && team !== 200) team = event.teamId === 100 ? 200 : event.teamId === 200 ? 100 : undefined;
      }
      if (!objective) continue;
      if (typeof event.timestamp !== "number" || !Number.isSafeInteger(event.timestamp) || event.timestamp < 0) return null;
      moments.push({ seconds: Math.floor(event.timestamp / 1000), objective,
        ...(team === 100 ? { side: "Blue" as const } : team === 200 ? { side: "Red" as const } : {}) });
    }
  }
  return moments.sort((a, b) => a.seconds-b.seconds);
}

async function loadTimeline(id: string): Promise<Result> {
  const { status, body } = await readRiotTimeline(id);
  if (status === 429) return { status: "limited" };
  if (status === 404) return { status: "missing" };
  if (status !== 200) return { status: "unavailable" };
  const events = objectiveEvents(body, id);
  return events ? { status: "available", events, observedAt: new Date().toISOString() } : { status: "unavailable" };
}

export async function readObjectiveTimeline(reference: MatchReference, viewer: number | null): Promise<Result> {
  try {
    // Check the named source for this viewer before consulting even warm public facts.
    const entitled = await readQuestionMatch(reference, viewer);
    if (!entitled) return { status: "restricted" };
    const id = entitled.matchId;
    const cached = cache.get(id);
    if (cached && cached.until > Date.now()) return cached.result;
    const inflight = pending.get(id);
    if (inflight) return inflight;
    if (pending.size >= 4) return { status: "limited" };
    const task = loadTimeline(id).then(result => {
      if (result.status === "available" || result.status === "missing") {
        cache.delete(id);
        if (cache.size >= 80) cache.delete(cache.keys().next().value!);
        cache.set(id, { until: Date.now() + 600_000, result });
      }
      return result;
    }).finally(() => pending.delete(id));
    pending.set(id, task);
    return await task;
  } catch { return { status: "unavailable" }; }
}
