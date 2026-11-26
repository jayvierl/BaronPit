export const reportRules = {
  harassment: "Targeted harassment",
  hate: "Hate or discrimination",
  fraud: "Boosting, scam or fraud",
  spam: "Spam or manipulation",
  sexual: "Sexual content",
  child_safety: "Child safety or exploitation",
  threats: "Credible threat",
  private_information: "Exposed private information",
  imminent_harm: "Imminent self-harm",
  other: "Other community rule",
} as const;
export const urgentRules = ["child_safety", "threats", "private_information", "imminent_harm"];
export type Rule = keyof typeof reportRules;
export function isRule(s: unknown): s is Rule {
  return typeof s === "string" && Object.hasOwn(reportRules, s);
}
export const targetKinds = ["post", "comment", "lfg", "duo_request", "user", "room"] as const;
export type TargetKind = (typeof targetKinds)[number];
export function isKind(s: unknown): s is TargetKind {
  return targetKinds.some((v) => v === s);
}
export const decisions = {
  dismiss: "No violation",
  remove: "Remove and warn",
  restrict1: "Restrict for 24 hours",
  restrict7: "Restrict for 7 days",
  suspend30: "Suspend for 30 days",
  ban: "Permanently restrict participation",
} as const;
export type Decision = keyof typeof decisions;
export const days: Record<Decision, number> = {
  dismiss: 0,
  remove: 0,
  restrict1: 1,
  restrict7: 7,
  suspend30: 30,
  ban: 0,
};
export function isDecision(s: unknown): s is Decision {
  return typeof s === "string" && Object.hasOwn(decisions, s);
}
export { validId as positiveId } from "./ids";
