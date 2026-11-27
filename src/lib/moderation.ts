/**
 * Automated text moderation — three-band model (moderation spec §1.4/§2.1):
 *   score >= 60  -> block (never published)
 *   score >= 30  -> borderline band (outcome depends on account trust)
 *   else         -> publish
 * Plus the spec's cheap wins: new-account probation weighting, link friction
 * for low-trust accounts, and off-platform contact-handle detection for LFG.
 * A managed vendor (OpenAI Moderation / Azure) can slot behind scoreContent
 * later without changing callers.
 *
 * Publish outcomes follow the Threads-style model (moderation-automation
 * spec): the filter is the gate, so borderline work only waits when the
 * author is still on probation. Established accounts publish immediately and
 * the item is flagged for the reviewer sweep instead of sitting invisible.
 *
 * On top of the bands sits the new-account ramp (growth-push hardening):
 * day-one accounts have everything held for review, accounts in their first
 * week have link posts held, and a raid mode (MODERATION_RAID_MODE=on)
 * widens both windows. Ramp holds are routine, not violations — the
 * reviewer sweep approves them whenever the content itself is in criteria.
 */

const SLURS = [
  "nigger", "nigga", "faggot", "fag", "retard", "kike", "spic", "chink", "tranny", "wetback",
];
const SEVERE_PHRASES = ["kill yourself", "kys", "kill urself", "end yourself", "hang yourself"];
const PROFANITY = [
  "fuck", "shit", "bitch", "asshole", "bastard", "whore", "slut", "dick", "pussy", "cunt",
];
const CONTACT_PATTERNS = [
  /(?:^|[^\w])@[a-z0-9_.]{2,}/i, /\b[\w.+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  /\b(?:discord|snapchat|telegram|whatsapp|instagram|tiktok)\s+(?:me|at|handle|user(?:name)?)\b/i,
  /\b(?:t\.me|discord(?:app)?\.com|bit\.ly|tinyurl\.com|wa\.me|linktr\.ee|www\.)[\/.]/i,
  /(?:^|[^\w])(?:[\w.]+#[\w]{2,})(?=\s|$|[.,!])/i, /(?:\+?\d[(). -]*){8,15}\b/,
  /\b(?:[a-z0-9-]+\.)+(?:com|net|org|gg|tv|io|me|co|app|xyz|link|ly)\b/i,
  /discord\.gg\//i,
  /discord\s*[:#]\s*[\w.]{2,}/i,
  /add me on discord/i,
  /my discord is/i,
  /snapchat\s*[:#]/i,
  /telegram\s*[:@]/i,
];

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t")
    .replace(/\$/g, "s").replace(/@/g, "a")
    .replace(/(.)\1{2,}/g, "$1$1");
}

export interface ModResult {
  score: number;
  action: "publish" | "hold" | "block";
  hits: string[];
  hasContactHandle: boolean;
  linkCount: number;
}

export function scoreContent(raw: string, opts: { lowTrust?: boolean; contactText?: string } = {}): ModResult {
  const text = raw ?? "";
  const folded = fold(text);
  const hits: string[] = [];
  let score = 0;

  for (const w of SLURS) {
    if (new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(folded)) { score += 100; hits.push("slur"); break; }
  }
  for (const p of SEVERE_PHRASES) {
    if (folded.includes(p)) { score += 100; hits.push("self-harm-bait"); break; }
  }

  const linkCount = (text.match(/https?:\/\/|www\./gi) ?? []).length;
  if (linkCount > 0) { score += 25 * linkCount; hits.push("link"); }
  if (opts.lowTrust && linkCount > 0) { score += 35; hits.push("new-account-link"); }

  let profanityHits = 0;
  for (const w of PROFANITY) {
    if (new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(folded)) profanityHits += 1;
  }
  if (profanityHits > 0) { score += Math.min(30, profanityHits * 12); hits.push("profanity"); }

  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 12) {
    const caps = letters.replace(/[^A-Z]/g, "").length / letters.length;
    if (caps > 0.7) { score += 15; hits.push("caps"); }
  }
  if (/(.)\1{7,}/.test(text)) { score += 20; hits.push("char-spam"); }
  const words = folded.split(/\s+/).filter(Boolean);
  if (words.length >= 6) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    const top = Math.max(...counts.values());
    if (top / words.length > 0.45) { score += 20; hits.push("word-spam"); }
  }
  if (opts.lowTrust) { score += 15; hits.push("probation"); }

  const hasContactHandle = CONTACT_PATTERNS.some((re) => re.test((opts.contactText ?? text).normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "")));
  if (hasContactHandle) { score += 20; hits.push("contact-handle"); }

  const action = score >= 60 ? "block" : score >= 30 ? "hold" : "publish";
  return { score, action, hits, hasContactHandle, linkCount };
}

export type PublishOutcome = "block" | "hold" | "publish" | "publish-flagged";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Raid mode is an operator switch read from the environment at publish
 * time. Only the exact value "on" enables it — a missing or invalid value
 * is off, so a typo can never fail closed into holding everyone's posts.
 */
export function raidModeEnabled(env?: { MODERATION_RAID_MODE?: string }): boolean {
  const source = env ?? (typeof process !== "undefined" ? process.env : undefined);
  return source?.MODERATION_RAID_MODE === "on";
}

export interface PublishOptions {
  lowTrust?: boolean;
  contactText?: string;
  /** Author's account creation time (ISO string). Missing or unparseable
   *  age is treated as day-one — fail closed, like a screening outage. */
  authorCreatedAt?: string | null;
  /** Whether the submission contains a link, per the caller's link
   *  detection (includesRoomLink). Falls back to the score's link count. */
  hasLink?: boolean;
  /** Clock override for tests; defaults to Date.now(). */
  now?: number;
  /** Raid-mode override for tests; defaults to raidModeEnabled(). */
  raidMode?: boolean;
}

type RampHit = "new-account-day-one" | "new-account-link";

/**
 * The new-account ramp, applied above the score bands:
 *   age < 1 day (or unknown)      -> hold everything ("new-account-day-one")
 *   age < 7 days, with a link     -> hold ("new-account-link")
 * Raid mode widens the hold-everything window to 7 days and the link
 * window to 30 days. Returns the hit label to record, or null when the
 * ramp does not apply and the normal bands decide.
 */
function newAccountRampHit(mod: ModResult, opts: PublishOptions): RampHit | null {
  const now = opts.now ?? Date.now();
  const raid = opts.raidMode ?? raidModeEnabled();
  const created = opts.authorCreatedAt ? Date.parse(opts.authorCreatedAt) : NaN;
  const age = Number.isFinite(created) ? now - created : null;
  if (age === null || age < (raid ? 7 : 1) * DAY_MS) return "new-account-day-one";
  if (age < (raid ? 30 : 7) * DAY_MS && (opts.hasLink ?? mod.linkCount > 0)) return "new-account-link";
  return null;
}

/**
 * Map a scored submission to its publish outcome by account trust:
 *   block band    -> blocked at publish, whoever wrote it (deny wins over
 *                    every ramp hold)
 *   new-account   -> held for review under the ramp above, whatever the
 *     ramp           score band, with the ramp label added to the hits
 *   borderline    -> held for review from low-trust (probation) accounts;
 *                    published and flagged for the reviewer sweep from
 *                    established accounts
 *   clean         -> published
 * A screening outage ("screening-unavailable") stays fail-closed: the item
 * holds for a reviewer no matter who wrote it, matching the posture callers
 * already apply to that hit.
 */
export function publishOutcome(mod: ModResult, opts: PublishOptions = {}): PublishOutcome {
  if (mod.action === "block") return "block";
  if (mod.hits.includes("screening-unavailable")) return "hold";
  const ramp = newAccountRampHit(mod, opts);
  if (ramp) {
    if (!mod.hits.includes(ramp)) mod.hits.push(ramp);
    return "hold";
  }
  if (mod.action === "publish") return "publish";
  return opts.lowTrust ? "hold" : "publish-flagged";
}

/** Duplicate-content signal: same body posted repeatedly (spec §2.3). */
export function bodyFingerprint(text: string): string {
  return fold(text).replace(/\s+/g, " ").trim().slice(0, 200);
}
