import { dailyCallScenarios, type DailyCallScenario } from "./daily-call-scenarios";

/** An editor-approved Daily Call breakdown, in the three parts the editors
 * write for a closed call: when two options make sense, what can go wrong,
 * and what would change the call. Breakdowns live with the scenarios in
 * `daily-call-scenarios.ts` — the same code-reviewed editorial path as the
 * scenario titles, bodies and options — and a breakdown only reaches readers
 * when its `published` flag is set there. */
export interface DailyCallBreakdown {
  when: string;
  risk: string;
  changes: string;
}

/** The published breakdown for a Daily Call, found by the title stored on the
 * call when it opened. Returns null when the scenario carries no breakdown or
 * the editors have not published it — callers must say so plainly rather than
 * inventing a consensus. */
export function publishedBreakdownForTitle(title: string | null | undefined): DailyCallBreakdown | null {
  if (!title) return null;
  const scenario: DailyCallScenario | undefined = dailyCallScenarios.find(entry => entry.title === title);
  const breakdown = scenario?.breakdown;
  if (!breakdown?.published) return null;
  const when = breakdown.when.trim(), risk = breakdown.risk.trim(), changes = breakdown.changes.trim();
  return when && risk && changes ? { when, risk, changes } : null;
}

/** The honest vote note for a poll tally line. A closed call with no votes
 * says nobody voted; it never borrows the open poll's "yet". */
export function dailyCallVoteNote(closed: boolean, totalVotes: number): string | null {
  if (totalVotes > 0) return null;
  return closed ? "No votes were cast on this call." : "No votes yet";
}

export type DailyCallBreakdownState = "open" | "published" | "unpublished" | "no-votes";

/** Which breakdown block a Daily Call shows. Open calls never leak a
 * breakdown early. A published breakdown is editorial, not a vote summary,
 * so it shows even when nobody voted (the tally line separately reports
 * that no votes were cast); with votes but no breakdown, the card says the
 * breakdown has not been published. */
export function dailyCallBreakdownState(input: {
  closed: boolean;
  totalVotes: number;
  breakdown: DailyCallBreakdown | null;
}): DailyCallBreakdownState {
  if (!input.closed) return "open";
  if (input.breakdown) return "published";
  return input.totalVotes > 0 ? "unpublished" : "no-votes";
}
