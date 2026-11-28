import { isEarlySurrender } from "./match-performance";
import type { MatchSummary } from "./pure";

/** One standout fact for a match review card. Every value comes straight from
 * the stored match record; a stat that was never stored produces no standout
 * rather than an invented zero. */
export interface ReviewStandout {
  value: string;
  label: string;
}

function validShare(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1;
}

function validFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Deterministic standout choice, in evidence order: stored team damage share
 * (only on snapshots carrying the damage fields), then kill participation,
 * then vision. Anything else stays unshown. */
export function reviewStandout(
  match: Pick<MatchSummary, "damageVersion" | "teamDamageShare" | "killParticipation" | "vision">,
): ReviewStandout | null {
  if (match.damageVersion === 1 && validShare(match.teamDamageShare)) {
    return { value: `${Math.round(match.teamDamageShare * 100)}%`, label: "of team champion damage" };
  }
  if (validFraction(match.killParticipation) && match.killParticipation > 0) {
    return { value: `${Math.round(match.killParticipation * 100)}%`, label: "kill participation" };
  }
  if (typeof match.vision === "number" && Number.isFinite(match.vision) && match.vision > 0) {
    return { value: `${match.vision}`, label: "vision score" };
  }
  return null;
}

export interface ReviewQuestion {
  lead: string;
  options: string;
}

/** The decision question is an invitation to look, never a diagnosis: it only
 * changes which stored lenses are named, and never claims why a game was won
 * or lost. Vision is offered only when a vision score was actually stored,
 * kill participation only when it was stored. */
export function reviewQuestion(
  match: Pick<MatchSummary, "vision" | "killParticipation">,
): ReviewQuestion {
  const lead = "What would you review first?";
  if (typeof match.vision === "number" && Number.isFinite(match.vision)) {
    return { lead, options: "Positioning, vision, or how the team fights started?" };
  }
  if (validFraction(match.killParticipation)) {
    return { lead, options: "Positioning, fight selection, or how the team fights started?" };
  }
  return { lead, options: "Positioning, lane decisions, or how the team fights started?" };
}

/** The newest completed ranked game in a stored snapshot (newest first).
 * Remakes and early surrenders are not completed games, so they never become
 * the review target. */
export function latestRankedMatch(matches: readonly MatchSummary[]): MatchSummary | null {
  return matches.find(match =>
    (match.queueId === 420 || match.queueId === 440) && !isEarlySurrender(match)) ?? null;
}

/** The homepage example, shaped exactly like a stored match summary. Only the
 * fields Jay's concept verified are ever displayed (champion, role, result,
 * K/D/A, rating, damage share); the remaining fields are neutral placeholders
 * the review card does not render. It is always labeled EXAMPLE and is never
 * presented as a real player's live data. */
export const EXAMPLE_REVIEW_MATCH: MatchSummary = {
  matchId: "EXAMPLE_ANNIE_MID",
  champion: "Annie",
  win: false,
  kills: 12,
  deaths: 8,
  assists: 2,
  cs: 0,
  durationSec: 0,
  queueId: 420,
  role: "MIDDLE",
  playedAt: 0,
  items: [],
  damageVersion: 1,
  teamDamageShare: 0.35,
  performanceRating: 6.5,
};

export const EXAMPLE_REVIEW_EYEBROW = "EXAMPLE REVIEW · RANKED SOLO/DUO";

/** The example's own deep link: the homepage with the example review already
 * expanded, anchored to the card. The homepage reads `example=1` from its
 * search params and renders the card open, so the link works when pasted
 * fresh — never the homepage with the example hidden. */
export const EXAMPLE_REVIEW_HREF = "/?example=1#example-review";

/** The concept's exact question for the example card. The example stores no
 * vision score, so the generic selector would not name vision; the concept
 * wording is carried explicitly instead of inventing a stored stat. */
export const EXAMPLE_REVIEW_QUESTION: ReviewQuestion = {
  lead: "What would you review first?",
  options: "Positioning, vision, or how the team fights started?",
};
