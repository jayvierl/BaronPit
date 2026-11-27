import type { MatchParticipantSummary, MatchSummary } from "./pure";

export const RATING_VERSION = 2;
export const RATING_DESCRIPTION = "In completed ranked Solo/Duo and Flex games of at least 15 minutes, we compare each player with the opponent in the same role. We weigh kill participation, damage per gold, vision per minute, deaths per ten minutes, gold per minute and, when available for everyone, objective damage per minute. An even comparison scores 5.5. The highest unrounded score on each complete team earns MVP (win) or Team Ace (loss). Exact ties share the badge.";
export const MATCH_DETAILS_VERSION = 3;
export const EARLY_SURRENDER_REASON = "Early surrenders and remakes are excluded.";
const missing = "The match record lacks complete, comparable role data.";

/** True only when the stored rating evidence itself flags the game as a remake
 * or early surrender. Other queues carry no such flag, so nothing is guessed. */
export function isEarlySurrender(match: Pick<MatchSummary, "ratingReason">): boolean {
  return match.ratingReason === EARLY_SURRENDER_REASON;
}

export function eligibleForMatchRating(queue: number, seconds: number) {
  return (queue === 420 || queue === 440) && seconds >= 900 && seconds <= 86400;
}

function ineligibleReason(queue: number, seconds: number) {
  if (queue !== 420 && queue !== 440) return "Only ranked Solo/Duo and Flex games are rated.";
  if (seconds < 900) return "Games under 15 minutes are excluded.";
  if (seconds > 86400) return "The recorded game duration is outside the supported range.";
}

export function ratingExplanation(match: MatchSummary) {
  return ineligibleReason(match.queueId, match.durationSec) ?? match.ratingReason ??
    (match.detailsVersion !== MATCH_DETAILS_VERSION ? "This saved game has no current rating evidence." : missing);
}

function quantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;
}

export function validRating(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10;
}

export function withTeamBadges(team: MatchParticipantSummary[], win: boolean): MatchParticipantSummary[] {
  if (team.length !== 5 || !team.every(p => validRating(p.performanceRating))) return team;
  const best = Math.max(...team.map(p => p.performanceRating!));
  const shared = team.filter(p => p.performanceRating === best).length > 1;
  const badge = win ? (shared ? "Shared MVP" : "MVP") : (shared ? "Shared Team Ace" : "Team Ace");
  return team.map(p => p.performanceRating === best ? { ...p, ratingBadge: badge } : p);
}

type Team = { win: boolean; kills: number; vision: number; damage: number; roles: Set<string> };
type Evidence = {
  team: Team; role: string; takedowns: number; deaths: number; vision: number;
  damage: number; gold: number; objectives: unknown;
};
type Rated = { score: number; reason: string };
type Result = { rows: Rated[] } | { reason: string };
const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

// Score both sides from one completed Match-v5 response. Compare within a
// matched role, queue and duration instead of estimating population percentiles.
export function rateMatch(participants: Record<string, unknown>[], queue: number, seconds: number, map: unknown): Result {
  const exclusion = ineligibleReason(queue, seconds);
  if (exclusion) return { reason: exclusion };
  if (map !== 11) return { reason: "Only Summoner’s Rift games are rated." };
  if (participants.some(p => p.gameEndedInEarlySurrender === true)) return { reason: EARLY_SURRENDER_REASON };
  if (participants.length !== 10 || new Set(participants.map(p => p.participantId)).size !== 10) return { reason: missing };

  const byTeam = new Map<number, Team>();
  const facts: Evidence[] = [];
  const minutes = seconds / 60;
  const objectivesAvailable = participants.every(p => quantity(p.damageDealtToObjectives));
  for (const p of participants) {
    const { teamId, participantId, win, kills, assists, deaths, totalDamageDealtToChampions: damage, goldEarned: gold,
      visionScore: vision, gameEndedInEarlySurrender, teamPosition: role } = p;
    if ((teamId !== 100 && teamId !== 200) || !quantity(participantId) || participantId < 1 || participantId > 10 ||
      typeof win !== "boolean" || typeof role !== "string" || !roles.includes(role) || gameEndedInEarlySurrender !== false ||
      !quantity(kills) || !quantity(assists) || !quantity(deaths) || !quantity(damage) || !quantity(gold) || !gold || !quantity(vision)) return { reason: missing };
    const team = byTeam.get(teamId) ?? { win, kills: 0, vision: 0, damage: 0, roles: new Set<string>() };
    if (team.win !== win || team.roles.has(role)) return { reason: missing };
    team.roles.add(role);
    team.kills += kills;
    team.vision += vision;
    team.damage += damage;
    byTeam.set(teamId, team);
    facts.push({ team, role, takedowns: kills + assists, deaths, vision, damage, gold, objectives: p.damageDealtToObjectives });
  }
  const blue = byTeam.get(100), red = byTeam.get(200);
  if (blue?.roles.size !== 5 || red?.roles.size !== 5 || blue.win === red.win ||
    facts.some(p => !p.team.kills || !p.team.damage || !p.team.vision || p.takedowns > p.team.kills)) return { reason: missing };

  const rows = facts.map(p => {
    const peer = facts.find(q => p.role === q.role && p.team !== q.team)!;
    // Small denominators are damped by signal-specific floors. The symmetric
    // difference is bounded before weighting; no signal can dominate the scale.
    const signals = [
      { name: "kill participation", weight: 25, own: p.takedowns / p.team.kills, other: peer.takedowns / peer.team.kills, floor: .20, unit: "%" },
      { name: "damage per gold", weight: 20, own: p.damage / p.gold, other: peer.damage / peer.gold, floor: .4, unit: "" },
      { name: "vision/min", weight: 20, own: p.vision / minutes, other: peer.vision / minutes, floor: .3, unit: "" },
      { name: "deaths/10 min", weight: 20, own: p.deaths * 10 / minutes, other: peer.deaths * 10 / minutes, floor: .8, unit: "" },
      { name: "gold/min", weight: 10, own: p.gold / minutes, other: peer.gold / minutes, floor: 180, unit: "" },
    ];
    if (objectivesAvailable) signals.push({ name: "objective damage/min", weight: 5, own: Number(p.objectives) / minutes,
      other: Number(peer.objectives) / minutes, floor: 50, unit: "" });
    const weighted = signals.map(signal => {
      const direction = signal.name === "deaths/10 min" ? -1 : 1;
      const delta = direction * (signal.own - signal.other) / Math.max(signal.floor, signal.own, signal.other);
      return { ...signal, impact: delta * signal.weight };
    });
    const score = 5.5 + 4.5 * weighted.reduce((sum, s) => sum + s.impact, 0) / weighted.reduce((sum, s) => sum + s.weight, 0);
    const most = [...weighted].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))[0];
    const format = (n: number) => most.unit === "%" ? Math.round(n * 100) + "%" : n.toFixed(1);
    const reason = most.impact === 0 ? "All measured contributions matched the opposing role." :
      `Largest difference against the opposing role: ${most.name}, ${format(most.own)} vs ${format(most.other)}.`;
    return { score, reason };
  });
  return { rows };
}
