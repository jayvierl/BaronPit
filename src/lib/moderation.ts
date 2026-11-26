/**
 * Automated text moderation — three-band model (moderation spec §1.4/§2.1):
 *   score >= 60  -> block (never published)
 *   score >= 30  -> hold for human review (invisible until approved)
 *   else         -> publish
 * Plus the spec's cheap wins: new-account probation weighting, link friction
 * for low-trust accounts, and off-platform contact-handle detection for LFG.
 * A managed vendor (OpenAI Moderation / Azure) can slot behind scoreContent
 * later without changing callers.
 */

const SLURS = [
  "nigger", "nigga", "faggot", "fag", "retard", "kike", "spic", "chink", "tranny", "wetback",
];
const SEVERE_PHRASES = ["kill yourself", "kys", "kill urself", "end yourself", "hang yourself"];
const PROFANITY = [
  "fuck", "shit", "bitch", "asshole", "bastard", "whore", "slut", "dick", "pussy", "cunt",
];
const CONTACT_PATTERNS = [
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

export function scoreContent(raw: string, opts: { lowTrust?: boolean } = {}): ModResult {
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

  const hasContactHandle = CONTACT_PATTERNS.some((re) => re.test(text));
  if (hasContactHandle) { score += 20; hits.push("contact-handle"); }

  const action = score >= 60 ? "block" : score >= 30 ? "hold" : "publish";
  return { score, action, hits, hasContactHandle, linkCount };
}

/** Duplicate-content signal: same body posted repeatedly (spec §2.3). */
export function bodyFingerprint(text: string): string {
  return fold(text).replace(/\s+/g, " ").trim().slice(0, 200);
}
