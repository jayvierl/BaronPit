import { hasPaymentOffer } from "./duo-gratuity";
import { SCHEDULE_BLOCKS, DUO_ROLES } from "./pure";
import { scoreContent, type ModResult } from "./moderation";

type Choice = "chill" | "tryhard" | "both";
export interface DuoPreferences {
  roles: string[];
  blocks: string[];
  voice: boolean;
  vibe: Choice;
  note: string;
}
export type ListingInput = { ok: true; value: DuoPreferences; moderation: ModResult } | { ok: false; error: string };

function choices(value: unknown, allowed: readonly string[], min: number, max: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((item) => typeof item === "string" && allowed.includes(item)) &&
    new Set(value).size === value.length
  );
}

export function duoPreferences(value: unknown): ListingInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, error: "Choose your duo preferences." };
  const { roles, blocks, voice, vibe, note } = value as Record<string, unknown>;
  if (
    !choices(roles, DUO_ROLES, 1, 3) ||
    !choices(blocks, SCHEDULE_BLOCKS, 1, 8) ||
    typeof voice !== "boolean" ||
    (vibe !== "chill" && vibe !== "tryhard" && vibe !== "both") ||
    typeof note !== "string" ||
    note.length > 300
  )
    return {
      ok: false,
      error: "Choose 1–3 roles, a play time and a playstyle. Keep your note within 300 characters.",
    };
  const result = scoreContent(note);
  if (hasPaymentOffer(note)) return { ok: false, error: "Keep payment requests and tip offers out of duo listings." };
  if (
    result.hasContactHandle ||
    result.linkCount ||
    /\b(?:paid duo|(?:elo|rank)\s*boost(?:ing)?|(?:sell(?:ing)?|buy(?:ing)?|shar(?:e|ing))\s+(?:my\s+|your\s+|an?\s+)?accounts?|boost(?:ing)?\s+for\s+(?:cash|money)|boost\s+(?:me|you)\s+to)\b/i.test(
      note.normalize("NFKC"),
    )
  )
    return {
      ok: false,
      error: "Keep contact inside Duo Finder. Remove handles, links, paid boosting or account trading.",
    };
  if (result.action === "block")
    return { ok: false, error: "Revise the note to follow the community guidelines." };
  return {
    ok: true,
    value: { roles, blocks, voice, vibe, note: note.trim() },
    moderation: result,
  };
}
