import { DUO_ROLES, SCHEDULE_BLOCKS } from "./pure";

export const partnerRoles = ["Any", "Top", "Jungle", "Mid", "ADC", "Support"] as const;
export const communications = { any: "Either", text: "Text only", voice: "Open to voice" } as const;
export const playstyles = { both: "Flexible", chill: "Chill", tryhard: "Competitive" } as const;

export type DuoFit = {
  role: (typeof DUO_ROLES)[number];
  partnerRole: (typeof partnerRoles)[number];
  blocks: string[];
  vibe: keyof typeof playstyles;
  communication: keyof typeof communications;
};

function isChoice<T extends string>(choices: readonly T[], value: unknown): value is T {
  return typeof value === "string" && choices.some(choice => choice === value);
}

export function parseDuoFit(data: Record<string, unknown>): DuoFit | null {
  const { role, partnerRole, blocks, vibe, communication } = data;
  if (!isChoice(DUO_ROLES, role) || !isChoice(partnerRoles, partnerRole) ||
      !Array.isArray(blocks) || blocks.length > SCHEDULE_BLOCKS.length ||
      !blocks.every(b => isChoice(SCHEDULE_BLOCKS, b)) || new Set(blocks).size !== blocks.length ||
      !isChoice(["both", "chill", "tryhard"] as const, vibe) ||
      !isChoice(["any", "text", "voice"] as const, communication)) return null;
  return { role, partnerRole, blocks: SCHEDULE_BLOCKS.filter(b => blocks.includes(b)), vibe, communication };
}

export function duoFitReasons(fit: DuoFit, listing: { roles: string[]; blocks: string[]; vibe: string; voice: boolean }) {
  const reasons: string[] = [];
  if (fit.partnerRole !== "Any") {
    if (listing.roles.includes(fit.partnerRole)) reasons.push("Plays " + fit.partnerRole);
    else if (listing.roles.includes("Fill")) reasons.push("Can fill " + fit.partnerRole);
  }
  const block = fit.blocks.find(b => listing.blocks.includes(b));
  if (block) reasons.push(block);
  if (fit.vibe !== "both" && (listing.vibe === fit.vibe || listing.vibe === "both"))
    reasons.push(listing.vibe === "both" ? "Flexible playstyle" : playstyles[fit.vibe]);
  if (fit.communication === "voice" && listing.voice) reasons.push("Open to voice");
  if (fit.communication === "text" && !listing.voice) reasons.push("Text only");
  return reasons;
}
