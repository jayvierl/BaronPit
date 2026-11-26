import { validId, validSubmissionId } from "./ids";

export const COMPOSER_SIGNOUT = "discussion-composer-signout";
const prefix = "discussion-tab-draft:";
const lifetime = 30 * 60_000;
export type PostKind = "text" | "build" | "poll" | "clip";
export const emptyPostDraft = {
  kind: "text" as PostKind, body: "", champion: "", items: [] as number[], itemQuery: "", runes: "",
  offMeta: false, options: ["", ""], baronCall: false, clipUrl: "", submissionId: null as string | null,
};
export type PostDraft = typeof emptyPostDraft;
export function hasPostDraft(draft: PostDraft) {
  return Boolean(draft.body || draft.champion || draft.items.length || draft.itemQuery || draft.runes ||
    draft.offMeta || draft.options.some(Boolean) || draft.baronCall || draft.clipUrl || draft.kind !== "text");
}

/** Also accepts the older, text-only draft handed off by the signed-out composer. */
export function readPostDraft(input: Record<string, unknown>): PostDraft {
  const text = (field: string, max: number) => typeof input[field] === "string" ? input[field].slice(0,max) : "";
  const options = Array.isArray(input.options)
    ? input.options.slice(0,4).map(v => typeof v === "string" ? v.slice(0,60) : "") : [];
  while (options.length < 2) options.push("");
  return {
    kind: input.kind === "poll" || input.kind === "clip" || input.kind === "build" ? input.kind : "text",
    body: text("body",2000), champion: text("champion",100), itemQuery: text("itemQuery",120),
    items: Array.isArray(input.items) ? input.items.filter(validId).slice(0,6) : [],
    runes: text("runes",240), clipUrl: text("clipUrl",2048), options, offMeta: input.offMeta === true,
    baronCall: input.baronCall === true, submissionId: validSubmissionId(input.submissionId) ? input.submissionId : null,
  };
}

function storedDraft(raw: string | null, epoch: string, now: number) {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (saved?.epoch === epoch && Number.isFinite(saved.expires) && saved.expires > now &&
        saved.expires <= now + lifetime && saved.draft && typeof saved.draft === "object" && !Array.isArray(saved.draft))
      return readPostDraft(saved.draft);
  } catch { /* Ignore truncated or obsolete browser storage. */ }
  return null;
}
export function clearTabDrafts(storage: Storage) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
}
export function openTabDraft(tab: Storage, global: Storage, owner: number, scope: string) {
  const epoch = global.getItem(COMPOSER_SIGNOUT) ?? "";
  const key = prefix + owner + ":" + scope;
  const now = Date.now();
  // Expire drafts in rooms the writer never reopened. Only this tab holds their text.
  for (let i = tab.length - 1; i >= 0; i--) {
    const candidate = tab.key(i);
    if (candidate?.startsWith(prefix) && !storedDraft(tab.getItem(candidate),epoch,now)) tab.removeItem(candidate);
  }
  return {
    restored: storedDraft(tab.getItem(key),epoch,now),
    save(draft: PostDraft) {
      // A suspended tab may receive the sign-out event after an input event.
      if ((global.getItem(COMPOSER_SIGNOUT) ?? "") !== epoch) return;
      if (hasPostDraft(draft))
        tab.setItem(key,JSON.stringify({ epoch, expires: Date.now() + lifetime, draft }));
      else tab.removeItem(key);
    },
  };
}

export function postReceipt(result: Record<string, unknown>) {
  if (result.status === "visible")
    return { tone: "ok", text: "Posted.", href: validId(result.postId) ? "/post/" + result.postId : "/me#submissions",
      label: validId(result.postId) ? "View thread" : "My submissions" };
  return { tone: result.status === "held" ? "warn" : "ok",
    text: result.status === "held" ? "Submitted for moderator review." : "Your earlier submission is recorded.",
    href: "/me#submissions", label: "My submissions" };
}
