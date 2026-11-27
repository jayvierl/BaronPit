import { buildCatalog } from "./build-catalog";
import { verifyBuildLoadout } from "./build-sharing";
import { clipLink } from "./clip-link";
import { gameCardMotion } from "./game-card-motion";
import type { DiscussionKind } from "./match-context";
import { hasBaronCallOptions } from "./poll";
import { scoreContent } from "./moderation";
import { resolveQuestionMatch, type ResolvedQuestionMatch } from "./question-match";
import { championCatalog, confirmedPatch } from "./riot";

export type PostKind = "text" | "build" | "poll" | "card" | "clip" | "media";
export type CreatePostInput = {
  kind: PostKind;
  body: string;
  roomId?: number | null;
  data?: Record<string, unknown>;
  submitForReview?: boolean;
  submissionId?: string;
};
type Draft = { ok: true; body: string; roomId: number | null; data: Record<string, unknown>; fields: string[] };
type Problem = { ok: false; error: string };
const invalid = (error: string): Problem => ({ ok: false, error });
export type CheckedMatchForPost = ResolvedQuestionMatch & { discussionKind?: DiscussionKind };

export async function preparePost(input: CreatePostInput, viewerId: number | null = null, checkedMatch?: CheckedMatchForPost): Promise<Draft | Problem> {
  if (!input || typeof input.body !== "string") return invalid("Enter a caption or post.");
  const body = input.body.trim();
  if (body.length > 2000) return invalid("Keep your post under 2,001 characters.");
  const roomId = input.roomId ?? null;
  if (roomId !== null && (!Number.isSafeInteger(roomId) || roomId < 1 || roomId > 2147483647)) return invalid("Choose an available room.");
  const d = input.data ?? {};
  if (typeof d !== "object" || Array.isArray(d)) return invalid("Check your post details.");
  const base = { ok: true as const, body, roomId };
  switch (input.kind) {
    case "text":
      return body ? {...base, data: {}, fields: [body]} : invalid("Write something to start the discussion.");
    case "poll": {
      if (body.length < 3 || !Array.isArray(d.options) || d.options.length < 2 || d.options.length > 4 ||
          !d.options.every(o => typeof o === "string" && o.trim().length > 0 && o.trim().length <= 60)) {
        return invalid("A poll needs a question and two to four options of up to 60 characters.");
      }
      const options: string[] = d.options.map(o => o.trim());
      if (new Set(options.map(o => o.toLowerCase())).size !== options.length) return invalid("Give each poll option a different answer.");
      if (d.call === true && !hasBaronCallOptions(options)) return invalid("Use the four preset options for a Baron call.");
      return {...base, data: d.call === true ? {options, call: true} : {options}, fields: [body, ...options]};
    }
    case "build": {
      if (!body) return invalid("Explain when you would use this build and why.");
      if (typeof d.champion !== "string" || d.champion.length > 64 || !Array.isArray(d.items) || !d.items.length || d.items.length > 6 ||
          !d.items.every(id => Number.isSafeInteger(id) && id > 0) || (d.runes != null && (typeof d.runes !== "string" || d.runes.length > 240))) {
        return invalid("Choose a champion and one to six items. Keep rune notes under 241 characters.");
      }
      const [patch, catalog] = await Promise.all([confirmedPatch(), championCatalog()]);
      if (!patch || !catalog.current || catalog.patch !== patch || !catalog.list.length) return invalid("The current patch catalog is unavailable. Your draft can be retried.");
      if (d.patch != null && d.patch !== patch) return invalid("The patch changed while you were writing. Refresh and check your saved draft against the current shop.");
      const search = d.champion.trim().toLowerCase();
      const champion = catalog.list.find(c => c.id.toLowerCase() === search || c.name.toLowerCase() === search);
      if (!champion) return invalid("Choose a champion from the current catalog.");
      const shop = await buildCatalog(patch);
      if (shop.patch !== patch) return invalid("Item data is unavailable. Try posting this build again shortly.");
      const loadout = verifyBuildLoadout(shop, d.items, d.keystoneId);
      if (!loadout) return invalid("Choose items and a keystone available on this patch’s Summoner’s Rift catalog.");
      const runes = typeof d.runes === "string" ? d.runes.trim() : "";
      return {...base, data: { champion: champion.id, items: loadout.items, ...(loadout.keystone && { keystone: loadout.keystone }),
        runes, offMeta: d.offMeta === true, patch }, fields: [body, runes]};
    }
    case "card": {
      const resolved = checkedMatch ?? await resolveQuestionMatch(d, viewerId);
      if (!resolved) return invalid("That public match is unavailable. Open the player’s match history and try again.");
      const { items, ...matchContext } = resolved.preview;
      const { champion, win, kills, deaths, assists, cs, matchId, platform, riotId } = matchContext;
      return { ...base, data: { puuid: resolved.sourcePuuid, matchId, platform, riotId, motion: gameCardMotion(win),
        matchContext: { ...matchContext, discussionKind: checkedMatch?.discussionKind },
        match: { champion, win, kills, deaths, assists, cs, items, queueId: matchContext.queueId, ...resolved.baron } }, fields: [body] };
    }
    case "clip": {
      const url = clipLink(d.url);
      return url ? {...base, data: {url:url.href}, fields: [body]} : invalid("Choose a supported clip link.");
    }
    case "media":
      return invalid("Direct uploads are paused until private media screening is ready.");
    default:
      return invalid("Choose a supported post type.");
  }
}

export function scoreSubmission(fields: string[], lowTrust: boolean) {
  // Score each displayed field individually so a long neutral caption cannot dilute a harmful option.
  return fields.map(field => scoreContent(field, {lowTrust})).reduce((worst, next) => next.score > worst.score ? next : worst);
}
