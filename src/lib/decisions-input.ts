import { validId } from "./ids";
import { matchRegion, safeMatchRiotId, type MatchReference } from "./match-context";
import { matchSectionId } from "./match-history";
import { isPlatform } from "./platforms";
import { readSearchReturn } from "./search-scopes";
import { safeReturnTo } from "./signin-return";

export const decisionRoles = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
export const decisionTopics = ["Laning", "Build choice", "Objective", "Teamfight", "Macro"] as const;
export function knownDecisionTopic(value: unknown) {
  return decisionTopics.find(topic => topic === value);
}
export const trialOutcomes = {
  helped: "It helped",
  mixed: "Mixed results",
  "still-testing": "Still testing",
} as const;
export type TrialOutcome = keyof typeof trialOutcomes;
export type DecisionContext = {
  itemId: number | null;
  itemName: string | null;
  champion: string;
  opponent: string | null;
  role: string;
  topic: string;
  patch: string | null;
};
export type QuestionMatch = MatchReference & { itemId?: number };
export const questionStarters = [
  { id: "items", label: "Which item should I have bought?", topic: "Build choice" },
  { id: "recall", label: "When should I have recalled?", topic: "Macro" },
  { id: "matchup", label: "How should we play this matchup?", topic: "Laning" },
] as const;

export type QuestionStarter = (typeof questionStarters)[number];

export function findQuestionStarter(id: unknown) {
  return questionStarters.find((starter) => starter.id === id);
}

export function returnToMatch(input: unknown, match: MatchReference) {
  const anchor = matchSectionId(match.matchId);
  if (!anchor) return undefined;
  const { pathname, hash, searchParams } = new URL(safeReturnTo(input), "https://match.invalid");
  const riotId = safeMatchRiotId(searchParams.get("riotId"), match.platform);
  if (pathname !== "/player" || hash !== `#${anchor}` || searchParams.get("platform") !== match.platform ||
      riotId?.toLowerCase() !== match.riotId.toLowerCase()) return undefined;
  const query = new URLSearchParams({ platform: match.platform, riotId: match.riotId });
  const from = readSearchReturn(searchParams.get("from"));
  const queue = searchParams.get("queue");
  const champion = searchParams.get("champion");
  const older = searchParams.get("older");
  const discussion = searchParams.get("fromDiscussion");
  if (from) query.set("from", from);
  if (queue && /^(?:[0-9]{1,6}|unknown)$/.test(queue)) query.set("queue", queue);
  if (champion && /^[a-z0-9]{1,40}$/i.test(champion)) query.set("champion", champion);
  if (older && /^[1-9][0-9]{0,2}$/.test(older)) query.set("older", older);
  if (discussion && /^\d+$/.test(discussion) && validId(Number(discussion))) query.set("fromDiscussion", discussion);
  query.set("match", match.matchId);
  return `/player?${query}${hash}`;
}

export function questionHref(match?: QuestionMatch, starter?: QuestionStarter["id"], options?: { discuss?: boolean; fromMatch?: string }) {
  if (!match) return "/questions/new";
  const query = new URLSearchParams({ platform: match.platform, riotId: match.riotId, matchId: match.matchId });
  if (match.itemId) query.set("item", String(match.itemId));
  if (starter) query.set("starter", starter);
  if (options?.discuss) query.set("discuss", "1");
  const from = returnToMatch(options?.fromMatch, match);
  if (from) {
    const source = new URL(from, "https://match.invalid");
    query.set("fromMatch", from);
    // Reserve room for the opaque sign-in draft key on long Unicode searches.
    if (query.toString().length > 1400) {
      source.searchParams.delete("from");
      query.set("fromMatch", source.pathname + source.search + source.hash);
    }
  }
  return "/questions/new?" + query;
}

export function cardQuestionMatch(data: Record<string, unknown>): QuestionMatch | null {
  const matchId = typeof data.matchId === "string" ? data.matchId : "";
  const region = matchRegion(matchId);
  if (!region) return null;
  const platform = typeof data.platform === "string" && isPlatform(data.platform) ? data.platform : region;
  const riotId = safeMatchRiotId(data.riotId, platform);
  return riotId ? { platform, riotId, matchId } : null;
}

export function matchDiscussionThread(postId: number, match: MatchReference, returnPath?: string) {
  const path = validId(postId) ? `/post/${postId}` : "/questions";
  const from = returnToMatch(returnPath, match);
  return from ? `${path}?` + new URLSearchParams({ fromMatch: from }) : path;
}
