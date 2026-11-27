import bundledChampions from "./champion-catalog.json";

/**
 * Champion / item tags inside post and comment bodies.
 *
 * A tag is stored as a compact token in the body text:
 *   [[c:Ahri|Ahri]]            champion (Data Dragon id + display name)
 *   [[i:3031|Infinity Edge]]   item (numeric Data Dragon id + display name)
 *
 * The id makes rendering exact (name, icon and card data come from the
 * catalog, never from re-matching plain text), while the embedded name is
 * the readable text the moderation filter scores and plain-text excerpts
 * fall back to. Bodies written before tags existed contain no tokens and
 * render unchanged.
 */

export type TagKind = "champion" | "item";

export interface TagRef {
  kind: TagKind;
  /** Champion Data Dragon id ("Ahri") or item id as a string ("3031"). */
  id: string;
  /** Display name captured when the tag was inserted. */
  name: string;
}

export type BodySegment =
  | { type: "text"; text: string }
  | { type: "tag"; tag: TagRef };

export interface TagChampion {
  id: string;
  name: string;
  title: string;
  tags: string[];
}

export interface TagItem {
  id: number;
  name: string;
  gold: number;
  effect: string;
  shop: boolean;
}

export interface TagCatalog {
  championPatch: string;
  itemPatch: string;
  champions: TagChampion[];
  items: TagItem[];
}

/** Patch of the bundled fallback catalogs; Data Dragon keeps old versions live. */
export const FALLBACK_PATCH: string = bundledChampions.patch;

const TOKEN = /\[\[(c|i):([A-Za-z0-9]+)\|([^\[\]|]{1,80})\]\]/g;

export function formatTagToken(tag: TagRef): string {
  return `[[${tag.kind === "champion" ? "c" : "i"}:${tag.id}|${tag.name}]]`;
}

/** Split a body into plain-text runs and tag tokens, in order. */
export function parseBodySegments(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", text: body.slice(last, index) });
    segments.push({
      type: "tag",
      tag: {
        kind: match[1] === "c" ? "champion" : "item",
        id: match[2],
        name: match[3].trim(),
      },
    });
    last = index + match[0].length;
  }
  if (last < body.length) segments.push({ type: "text", text: body.slice(last) });
  return segments;
}

export function hasTagTokens(body: string): boolean {
  return /\[\[(?:c|i):[A-Za-z0-9]+\|[^\[\]|]{1,80}\]\]/.test(body);
}

/** Body as a reader would say it: tokens become their display names. */
export function plainBodyText(body: string): string {
  return body.replace(TOKEN, (_whole, _kind, _id, name: string) => name.trim());
}

/** Same normalization the global game search uses: case/accents/punctuation folded away. */
export function normalizeTagName(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\p{M}\p{P}\s]/gu, "");
}

export function championIconUrl(patch: string, championId: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${championId}.png`;
}

export function itemIconUrl(patch: string, itemId: string | number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${itemId}.png`;
}

export function findTagChampion(catalog: TagCatalog, id: string): TagChampion | undefined {
  return catalog.champions.find((c) => c.id === id);
}

export function findTagItem(catalog: TagCatalog, id: string): TagItem | undefined {
  const numeric = Number(id);
  return Number.isSafeInteger(numeric) ? catalog.items.find((i) => i.id === numeric) : undefined;
}

export interface TagMatches {
  champions: TagChampion[];
  items: TagItem[];
}

function rank<T extends { name: string }>(entries: T[], extra: (entry: T) => string[], query: string, limit: number): T[] {
  if (!query) return [];
  const scored = entries.map((entry) => {
    const names = [entry.name, ...extra(entry)].map(normalizeTagName);
    const priority = names.some((n) => n === query) ? 0
      : names.some((n) => n.startsWith(query)) ? 1
      : names.some((n) => n.includes(query)) ? 2 : 3;
    return { entry, priority };
  });
  return scored
    .filter((s) => s.priority < 3)
    .sort((a, b) => a.priority - b.priority || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map((s) => s.entry);
}

/** Ranked catalog matches for one query phrase. Items are limited to the shop, like global search. */
export function matchTagEntries(catalog: TagCatalog, query: string, limit = 6): TagMatches {
  const squashed = normalizeTagName(query);
  return {
    champions: rank(catalog.champions, (c) => [c.id], squashed, limit),
    items: rank(catalog.items.filter((i) => i.shop), () => [], squashed, limit),
  };
}

export interface Suggestion {
  /** Index in the body where the matched phrase starts. */
  start: number;
  /** Index where replacement ends (caret extended to the end of the current word). */
  end: number;
  phrase: string;
  matches: TagMatches;
}

const NAME_CHAR = /[A-Za-z0-9\s.'&’-]/;
const WORD_CHAR = /[A-Za-z0-9'’.-]/;

/**
 * Decide whether the text before the caret looks like a champion/item name
 * being typed, and what should replace it. Candidates are the trailing
 * 1–3 word phrases, longest first. A candidate is accepted when it produces
 * catalog matches and is either at least 4 normalized characters (so short
 * prose words like "the" stay quiet) or exactly a catalog name/id (so
 * "Lux" and "Vi" still trigger). Returns null inside tokens, after a
 * space, or after a "#".
 */
export function pickSuggestion(catalog: TagCatalog, text: string, caret: number): Suggestion | null {
  if (caret <= 0 || caret > text.length) return null;
  if (/\s/.test(text[caret - 1])) return null;

  // Never trigger inside (or while touching) an existing token.
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (caret > start && caret <= end) return null;
    if (start >= caret) break;
  }

  // Walk back over name characters to find the run that ends at the caret.
  let runStart = caret;
  while (runStart > 0 && caret - runStart < 42 && NAME_CHAR.test(text[runStart - 1])) {
    if (text[runStart - 1] === "\n") break;
    runStart -= 1;
  }
  // Do not cross a token boundary.
  const lastTokenEnd = text.slice(0, caret).lastIndexOf("]]");
  if (lastTokenEnd >= runStart) runStart = lastTokenEnd + 2;
  const run = text.slice(runStart, caret);
  if (!run.trim()) return null;
  if (runStart > 0 && text[runStart - 1] === "#") return null;

  // Word-boundary offsets inside the run, for suffix phrases.
  const wordStarts: number[] = [];
  for (let i = 0; i < run.length; i += 1) {
    if (i === 0 || /\s/.test(run[i - 1])) wordStarts.push(i);
  }
  const candidates = wordStarts
    .slice(-3)
    .map((offset) => ({ start: runStart + offset, phrase: run.slice(offset).replace(/\s+/g, " ").trim() }))
    .filter((c) => c.phrase.length > 0)
    .reverse();

  let end = caret;
  while (end < text.length && WORD_CHAR.test(text[end])) end += 1;

  for (const candidate of candidates) {
    const matches = matchTagEntries(catalog, candidate.phrase);
    if (!matches.champions.length && !matches.items.length) continue;
    const squashed = normalizeTagName(candidate.phrase);
    const exact = [...matches.champions, ...matches.items].some(
      (entry) => normalizeTagName(entry.name) === squashed
        || (entry as TagChampion).id !== undefined && normalizeTagName(String((entry as TagChampion).id)) === squashed,
    );
    if (squashed.length >= 4 || exact) {
      return { start: candidate.start, end, phrase: candidate.phrase, matches };
    }
  }
  return null;
}

/**
 * Replace the suggested phrase with a tag token. The caret lands just past
 * the token and one separating space — added when the following text does
 * not already start with whitespace, reused when it does.
 */
export function applyTag(text: string, suggestion: Suggestion, tag: TagRef): { value: string; caret: number } {
  const token = formatTagToken(tag);
  const rest = text.slice(suggestion.end);
  const addSpace = rest === "" || /[A-Za-z0-9]/.test(rest[0]);
  const value = text.slice(0, suggestion.start) + token + (addSpace ? " " : "") + rest;
  const caret = suggestion.start + token.length + (addSpace || /^\s/.test(rest) ? 1 : 0);
  return { value, caret };
}
