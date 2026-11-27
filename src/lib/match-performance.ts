// Rank each signal across the ten participants, then rank their summed places.
// A sole leader earns 10. Players tied on the total share the places they occupy.
export function eligibleForMatchRating(queue: number, seconds: number) {
  return (queue === 420 || queue === 440) && seconds >= 15 * 60 && seconds <= 24 * 60 * 60;
}

export function storedMatchRating(value: unknown, queue: number, seconds: number) {
  return eligibleForMatchRating(queue, seconds) && typeof value === "number" && value >= 1 &&
    value <= 10 && Number.isInteger(value * 2) ? value : undefined;
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647;
}

// Tied values split the places they occupy, independent of the API's row order.
function averagePlace(values: number[], target: number) {
  const below = values.filter(value => value < target).length;
  const tied = values.filter(value => value === target).length;
  return below + (tied + 1) / 2;
}

export function matchPerformanceRating(participants: Record<string, unknown>[], playerIndex: number,
  queue: number, seconds: number, map: unknown): number | undefined {
  if (!eligibleForMatchRating(queue, seconds) || map !== 11 || participants.length !== 10 || !participants[playerIndex]) return;
  const slots = new Set<number>();
  const teams = new Map<number, { size: number; win: boolean; kills: number; damage: number; vision: number }>();
  const facts = [];
  for (const participant of participants) {
    const { participantId, teamId, win, kills, assists, deaths, totalDamageDealtToChampions: damage, visionScore: vision } = participant;
    if (!count(participantId) || participantId < 1 || participantId > 10 || slots.has(participantId) ||
        (teamId !== 100 && teamId !== 200) || typeof win !== "boolean" || participant.gameEndedInEarlySurrender !== false ||
        !count(kills) || !count(assists) || !count(deaths) || !count(damage) || !count(vision)) return;
    slots.add(participantId);
    const team = teams.get(teamId) ?? { size: 0, win, kills: 0, damage: 0, vision: 0 };
    if (team.win !== win) return;
    team.size++;
    team.kills += kills;
    team.damage += damage;
    team.vision += vision;
    teams.set(teamId, team);
    facts.push({ team, takedowns: kills + assists, deaths, damage, vision });
  }

  const blue = teams.get(100), red = teams.get(200);
  if (blue?.size !== 5 || red?.size !== 5 || blue.win === red.win) return;
  // A missing denominator is missing evidence, including for a zero-kill side.
  if (facts.some(p => !p.team.kills || !p.team.damage || !p.team.vision || p.takedowns > p.team.kills)) return;
  const signals = [
    facts.map(p => p.takedowns / p.team.kills),
    facts.map(p => p.damage / p.team.damage),
    facts.map(p => p.vision / p.team.vision),
    facts.map(p => -p.deaths),
  ];
  const scores = facts.map((_, index) => signals.reduce((sum, values) => sum + averagePlace(values, values[index]), 0));
  return averagePlace(scores, scores[playerIndex]);
}
