import { SESSION_QUEUE, validSessionStart } from "./duo-session";
import { partnerRoles } from "./duo-fit";
import { timeZoneName } from "./duo-schedule";
import { hasPaymentOffer } from "./duo-gratuity";
import { SCHEDULE_BLOCKS, DUO_ROLES } from "./pure";
import { scoreContent, type ModResult } from "./moderation";

type Choice = "chill" | "tryhard" | "both";
export interface DuoPreferences {
  start: number;
  roles: string[];
  partnerRole: string;
  timeZone: string | null;
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
  const { queue, start, roles, blocks = [], voice, vibe, note, partnerRole, timeZone } = value as Record<string, unknown>;
  if (queue !== SESSION_QUEUE || !validSessionStart(start))
    return { ok: false, error: "Choose a Normal Draft session starting in the next three hours." };
  if (
    (timeZone != null && !timeZoneName(timeZone)) ||
    (partnerRole != null && !partnerRoles.some(r => r === partnerRole)) ||
    !choices(roles, DUO_ROLES, 1, 3) ||
    !choices(blocks, SCHEDULE_BLOCKS, 0, 8) ||
    typeof voice !== "boolean" ||
    (vibe !== "chill" && vibe !== "tryhard" && vibe !== "both") ||
    typeof note !== "string" ||
    note.length > 300
  )
    return {
      ok: false,
      error: "Choose 1–3 roles and a playstyle. Keep your note within 300 characters.",
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
    value: { start, roles, partnerRole: typeof partnerRole === "string" ? partnerRole : "Any", timeZone: timeZoneName(timeZone), blocks, voice, vibe, note: note.trim() },
    moderation: result,
  };
}
