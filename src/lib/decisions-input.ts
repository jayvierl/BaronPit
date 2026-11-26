export const decisionRoles = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
export const decisionTopics = ["Laning", "Build choice", "Objective", "Teamfight", "Macro"] as const;
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
export type QuestionMatch = { puuid: string; matchId: string; itemId?: number };
export const questionStarters = [
  { id: "items", label: "Which item should I have bought?", topic: "Build choice" },
  { id: "recall", label: "When should I have recalled?", topic: "Macro" },
  { id: "matchup", label: "How should we play this matchup?", topic: "Laning" },
] as const;

export type QuestionStarter = (typeof questionStarters)[number];

export function findQuestionStarter(id: unknown) {
  return questionStarters.find((starter) => starter.id === id);
}

export function questionHref(match?: QuestionMatch, starter?: QuestionStarter["id"]) {
  if (!match) return "/questions/new";
  const query = new URLSearchParams({ puuid: match.puuid, matchId: match.matchId });
  if (match.itemId) query.set("item", String(match.itemId));
  if (starter) query.set("starter", starter);
  return "/questions/new?" + query;
}
