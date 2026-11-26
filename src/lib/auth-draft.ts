import { safeReturnTo, signInHref } from "./signin-return";
import { clearTabDrafts, COMPOSER_SIGNOUT } from "./composer-draft";

const PREFIX = "discussion-signin-draft:";
const TTL = 30 * 60_000;
const ORIGIN = "https://return.invalid";
type DraftRecord = { scope: string; destination?: string; expires: number; payload: Record<string, unknown> };

function unpack(raw: string | null): DraftRecord | undefined {
  try {
    const row = JSON.parse(raw || "null");
    if (row && typeof row.scope === "string" && Number.isFinite(row.expires) &&
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)) return row;
  } catch { /* Invalid browser storage is discarded. */ }
}

export function beginDraftSignIn(storage: Storage, scope: string, destination: string,
  payload: Record<string, unknown>, mode?: "signup" | "enrol") {
  const now = Date.now();
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX) && (unpack(storage.getItem(key))?.expires ?? 0) <= now) storage.removeItem(key);
  }
  const id = crypto.randomUUID();
  const destinationPath = safeReturnTo(destination);
  const url = new URL(destinationPath, ORIGIN);
  url.searchParams.set("draft", id);
  storage.setItem(PREFIX + id, JSON.stringify({ scope, destination: url.pathname + url.search + url.hash, expires: now + TTL, payload }));
  return signInHref(url.pathname + url.search + url.hash, mode);
}

function draftStorageKey(url: URL) {
  const id = url.searchParams.get("draft");
  return id && /^[0-9a-f-]{36}$/.test(id) ? PREFIX + id : null;
}

export function hasDraftContinuation(destination: string) {
  return !!draftStorageKey(new URL(safeReturnTo(destination), ORIGIN));
}

/** Read only the locally held text when the writer explicitly requests a copy. */
export function copyableDraftText(storage: Storage, destination: string): string | null {
  const path = safeReturnTo(destination);
  const key = draftStorageKey(new URL(path, ORIGIN));
  if (!key) return null;
  const saved = unpack(storage.getItem(key));
  if (!saved || saved.destination !== path || saved.expires <= Date.now()) return null;
  return typeof saved.payload.body === "string" && saved.payload.body.trim() ? saved.payload.body : null;
}

export function consumeAuthDraft(storage: Storage, scope: string, location: string) {
  const url = new URL(location, ORIGIN);
  const key = draftStorageKey(url);
  if (!key) return null;
  const saved = unpack(storage.getItem(key));
  if (saved && saved.scope !== scope) return null;
  storage.removeItem(key);
  if (!saved || saved.expires <= Date.now()) return null;
  url.searchParams.delete("draft");
  return { payload: saved.payload, destination: url.pathname + url.search + url.hash };
}

// Restore after hydration so the first client render matches the server, and
// cancelling an interrupted mount leaves the draft available on the next render.
export function restoreAfterMount(scope: string, apply: (payload: DraftRecord["payload"]) => void) {
  const frame = window.requestAnimationFrame(() => {
    let draft;
    try { draft = consumeAuthDraft(window.localStorage, scope, window.location.href); }
    catch { return; }
    if (draft) {
      window.history.replaceState(window.history.state, "", draft.destination);
      apply(draft.payload);
    }
  });
  return () => window.cancelAnimationFrame(frame);
}

export function currentAppPath() {
  return window.location.pathname + window.location.search + window.location.hash;
}

export function clearBrowserAuthDrafts() {
  try { clearTabDrafts(window.sessionStorage); } catch { /* Tab storage is optional. */ }
  try { window.localStorage.setItem(COMPOSER_SIGNOUT, crypto.randomUUID()); } catch { /* Keep clearing sign-in drafts if storage is full. */ }
  try {
    const storage = window.localStorage;
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) storage.removeItem(key);
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
}
