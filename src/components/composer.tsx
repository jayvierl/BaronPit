"use client";

import { beginDraftSignIn, consumeAuthDraft, currentAppPath } from "@/lib/auth-draft";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { clearTabDrafts, COMPOSER_SIGNOUT, emptyPostDraft, hasPostDraft, openTabDraft, postReceipt, readPostDraft, type PostDraft, type PostKind } from "@/lib/composer-draft";
import { useRouter } from "next/navigation";
import { clipLink } from "@/lib/clip-link";
import { buildThreadReturn } from "@/lib/build-sharing";
import { BARON_CALL_OPTIONS } from "@/lib/poll";
import { POST_TO_THE_PIT } from "@/lib/brand";
import { ActionFeedback, usePostAction } from "./post-action";
import { BuildFields, type BuildShop } from "./build-fields";
import { TagFieldWrap, useTagSuggest } from "./tag-suggest";
import { Avatar } from "./ui";
import type { AvatarIdentity } from "@/lib/author-identity";
import styles from "./thread.module.css";
import composerStyles from "./composer.module.css";

type Notice = { tone: string; text: string; href?: string; label?: string };

export function Composer({
  roomId,
  patch,
  champions,
  viewerIdentity,
  viewerId,
  anchorId = "compose",
  onDraftChange,
  buildContext,
}: {
  roomId?: number;
  patch: string;
  champions: string[];
  viewerIdentity?: AvatarIdentity | null;
  viewerId: number;
  anchorId?: string | null;
  onDraftChange?: (hasDraft: boolean) => void;
  buildContext?: { scope: string; champion?: string; item?: number; offMeta: boolean; returnHref: string; roomSlug?: string };
}) {
  const router = useRouter();
  const buildScope = buildContext?.scope;
  const presetChampion = buildContext?.champion;
  const presetItem = buildContext?.item;
  const presetOffMeta = buildContext?.offMeta;
  const initialDraft = useMemo<PostDraft>(() => buildScope ? {
    ...emptyPostDraft, kind: "build", champion: presetChampion ?? "", items: presetItem ? [presetItem] : [], offMeta: presetOffMeta === true,
  } : emptyPostDraft, [buildScope, presetChampion, presetItem, presetOffMeta]);
  const [draft, setDraft] = useState(initialDraft);
  const live = useRef(draft);
  const storage = useRef<ReturnType<typeof openTabDraft> | null>(null);
  const touched = useRef(false);
  const { kind, body, champion, items, runes, keystoneId, offMeta, options, baronCall, clipUrl } = draft;
  const [loadedShop, setShop] = useState<BuildShop | null>(null);
  const [msg, setMsg] = useState<Notice | null>(null);
  const action = usePostAction();
  const [itemError, setItemError] = useState(false);
  const [retry, setRetry] = useState(0);
  const shop = loadedShop?.patch === patch ? loadedShop : null;
  const scope = buildScope ?? `post:${roomId ?? "home"}`;
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const countId = useId();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    onDraftChange?.(hasPostDraft(draft));
  }, [draft, onDraftChange]);

  useEffect(() => {
    try { storage.current = openTabDraft(window.sessionStorage, window.localStorage, viewerId, scope); }
    catch { storage.current = null; }
    const frame = window.requestAnimationFrame(() => {
      let handoff = null;
      try { handoff = consumeAuthDraft(window.localStorage,scope,window.location.href); }
      catch { /* Session drafts still work if sign-in continuation is unavailable. */ }
      if (handoff) window.history.replaceState(window.history.state, "", handoff.destination);
      if (touched.current) return;
      const transferred = handoff && (handoff.payload.viewerId === undefined || handoff.payload.viewerId === viewerId)
        ? readPostDraft(handoff.payload) : null;
      const saved = transferred ?? storage.current?.restored;
      const restored = saved && buildScope
        ? saved.kind === "build" ? { ...saved, champion: presetChampion ?? saved.champion } : { ...initialDraft, body: saved.body }
        : saved;
      if (!restored) return;
      live.current = restored;
      setDraft(restored);
      if (transferred) {
        try { storage.current?.save(restored); } catch { setStorageError(true); }
        bodyRef.current?.focus();
      }
      setMsg({ tone: "ok", text: "Draft restored." });
    });
    function signedOut(event: StorageEvent) {
      if (event.key !== COMPOSER_SIGNOUT && event.key !== null) return;
      try { clearTabDrafts(window.sessionStorage); } catch { /* Storage is optional. */ }
      storage.current = null;
      touched.current = true;
      live.current = initialDraft;
      setDraft(initialDraft);
      setMsg(null);
      setConfirmDiscard(false);
      router.refresh();
    }
    window.addEventListener("storage", signedOut);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("storage",signedOut); };
  }, [scope, viewerId, router, buildScope, presetChampion, initialDraft]);

  function store(next: PostDraft) {
    touched.current = true;
    live.current = next;
    setDraft(next);
    try {
      storage.current?.save(next);
      setStorageError(!storage.current && hasPostDraft(next));
    } catch { setStorageError(true); }
  }
  function edit(changes: Partial<PostDraft>) {
    setMsg(null);
    setConfirmDiscard(false);
    store({ ...live.current, ...changes, submissionId: null });
  }
  const tagSuggest = useTagSuggest({
    inputRef: bodyRef,
    limit: 2000,
    value: body,
    apply: (next) => edit({ body: next }),
  });
  function clearDraft() {
    store(emptyPostDraft);
    live.current = initialDraft;
    setDraft(initialDraft);
  }
  function discard() {
    clearDraft();
    setAttempted("");
    setConfirmDiscard(false);
    setMsg({tone:"ok",text:"Draft discarded."});
    bodyRef.current?.focus();
  }

  function resumeAfterAuth() {
    try {
      const path = currentAppPath().split("#")[0] + "#compose";
      const href = beginDraftSignIn(window.localStorage, scope, path,
        {...live.current, viewerId}, action.authStep === "enrol" ? "enrol" : undefined);
      router.push(href);
    } catch { setMsg({tone: "err", text: "This browser couldn’t save your draft. Copy it before signing in."}); }
  }
  useEffect(() => {
    if (kind !== "build") return;
    const controller = new AbortController();
    fetch("/api/shop", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Item catalogue unavailable");
        const catalog: BuildShop = await r.json();
        if (!catalog.current || catalog.patch !== patch || !Array.isArray(catalog.choices) || !Array.isArray(catalog.keystones)) throw new Error("Current patch items unavailable");
        if (!controller.signal.aborted) {
          setShop(catalog);
          setItemError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setItemError(true);
      });
    return () => controller.abort();
  }, [kind, patch, retry]);
  const selectedOptions = baronCall ? BARON_CALL_OPTIONS : options.map((o) => o.trim()).filter(Boolean);
  const knownChampion = champions.find((c) => c.toLowerCase() === champion.trim().toLowerCase());
  const availableItems = shop ? new Set(shop.choices.map(item => item.id)) : null;
  const canPost =
    kind === "build"
      ? !!knownChampion && !!shop && items.length > 0 && items.every(id => availableItems?.has(id)) && !!body.trim() &&
        (keystoneId === null || shop.keystones.some(rune => rune.id === keystoneId))
      : kind === "poll"
        ? body.trim().length >= 3 &&
          selectedOptions.length >= 2 &&
          new Set(selectedOptions.map(o => o.toLowerCase())).size === selectedOptions.length
        : kind === "clip"
          ? !!clipLink(clipUrl)
          : !!body.trim();

  const data =
    kind === "build"
      ? { champion: knownChampion, items, runes, keystoneId, offMeta, patch }
      : kind === "poll"
        ? { options: selectedOptions, ...(baronCall && {call: true}) }
        : kind === "clip"
          ? { url: clipLink(clipUrl)?.href }
          : {};
  const payload = { kind, body, roomId: roomId ?? null, data };
  const submissionKey = JSON.stringify(payload);
  const [attempted, setAttempted] = useState("");
  const reconsider = action.reconsider && attempted === submissionKey;
  async function submit(submitForReview = false) {
    if (!canPost || action.busy) return;
    setMsg(null);
    setAttempted(submissionKey);
    const id = live.current.submissionId ?? crypto.randomUUID();
    store({ ...live.current, submissionId: id });
    const result = await action.sendDraft("/api/social/post", {
      ...payload, expectedAuthorId: viewerId,
      submitForReview: submitForReview && reconsider,
    }, id);
    if (!result) return;
    clearDraft();
    setConfirmDiscard(false);
    const receipt = postReceipt(result);
    const source = buildContext && buildThreadReturn(buildContext.returnHref, knownChampion, items, buildContext.roomSlug);
    if (kind === "build" && receipt.label === "View thread" && receipt.href) {
      setMsg({ ...receipt, label: "View build discussion", href: source ? `${receipt.href}?${new URLSearchParams({ fromBuild: source.href })}` : receipt.href });
    } else setMsg(receipt);
    router.refresh();
  }
  const hasDraft = buildContext ? draft !== initialDraft : hasPostDraft(draft);

  return (
    <fieldset
      disabled={action.busy}
      className={`composer ${styles.editor}`}
      id={anchorId ?? undefined}
      aria-label={buildContext ? "Share a build" : roomId === undefined ? POST_TO_THE_PIT : "Post in this room"}
    >
      <div className="composer-head">
        {viewerIdentity && <Avatar {...viewerIdentity} size={40} />}
        <TagFieldWrap>
          <textarea
            ref={bodyRef}
            {...tagSuggest.fieldProps}
            aria-label={kind === "build" ? "Build reasoning" : "Post text"}
            aria-describedby={countId}
            disabled={action.busy}
            rows={2}
            placeholder={
              kind === "build"
                ? "When would you play this build, and why?"
                : kind === "poll"
                  ? "What should the room vote on?"
                  : kind === "clip"
                    ? "What happened in the clip?"
                    : "What’s on your mind? Tag a player with @."
            }
            value={tagSuggest.display}
            onChange={e => tagSuggest.change(e.currentTarget)}
            maxLength={tagSuggest.maxLength}
          />
          {tagSuggest.menu}
        </TagFieldWrap>
      </div>
      {!buildContext && <div className={`kind-tabs ${styles.formats}`} role="group" aria-label="Post format">
        {(["text", "build", "poll", "clip"] as PostKind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            disabled={action.busy}
            className={`kind-tab${kind === k ? " active" : ""}`}
            onClick={() => edit({ kind: k })}
          >
            {k === "text" ? "Text" : k === "build" ? "Build" : k === "poll" ? "Poll" : "Clip"}
          </button>
        ))}
      </div>}
      {kind === "build" && <BuildFields draft={draft} edit={edit} champions={champions} lockedChampion={presetChampion}
        patch={patch} shop={shop} shopError={itemError} retry={() => setRetry(value => value + 1)}/>}
      {kind === "poll" && (
        <div className="composer-extra" style={{ marginTop: 4, display: "grid", gap: 8 }}>
          <label>
            <input type="checkbox" checked={baronCall} onChange={e => edit({ baronCall: e.target.checked })} /> Make it a Baron call
          </label>
          {baronCall ? <ul>{BARON_CALL_OPTIONS.map(option => <li key={option}>{option}</li>)}</ul> : options.map((o, i) => (
            <input
              key={i}
              className="inline"
              aria-label={`Poll option ${i + 1}`}
              placeholder={`Option ${i + 1}`}
              value={o}
              maxLength={60}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                edit({ options: next });
              }}
            />
          ))}
          {!baronCall && options.length < 4 && (
            <button type="button" className="text-btn" onClick={() => edit({ options: [...options, ""] })}>
              + Add option
            </button>
          )}
        </div>
      )}
      {kind === "clip" && (
        <div className="composer-extra" style={{ marginTop: 4 }}>
          <input
            className="inline"
            aria-label="Clip link"
            maxLength={2048}
            type="url"
            placeholder="YouTube, Twitch, Medal or Streamable clip URL"
            value={clipUrl}
            onChange={(e) => edit({ clipUrl: e.target.value })}
            style={{ width: "100%" }}
          />
          <p className="meta" style={{ margin: "6px 0 0" }}>
            A moderator reviews your clip link before it appears. Other players can choose to open it on the host
            site.
          </p>
        </div>
      )}
      {attempted === submissionKey && <ActionFeedback error={action.error} />}
      {action.authStep && attempted === submissionKey && <button type="button" className="text-btn" onClick={resumeAfterAuth}>
        {action.authStep === "enrol" ? "Confirm eligibility and return to draft" : "Sign in and return to draft"}
      </button>}
      {reconsider && (
        <div className="composer-extra">
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setAttempted("");
              bodyRef.current?.focus();
            }}
          >
            Edit post
          </button>{" "}
          <button
            type="button"
            className="btn small secondary"
            disabled={action.busy}
            onClick={() => submit(true)}
          >
            Submit for review
          </button>
        </div>
      )}
      {msg && (
        <div role="status" className={`notice ${msg.tone} ${composerStyles.feedback}`}>
          {msg.text} {msg.href && <Link href={msg.href}>{msg.label}</Link>}
        </div>
      )}
      {storageError && <small role="status">Draft saving is unavailable in this browser. Copy your text before leaving.</small>}
      {confirmDiscard && <div className={composerStyles.discard} role="group" aria-label="Discard draft">
        <span>Discard this draft? </span>
        <button type="button" className="text-btn" onClick={() => setConfirmDiscard(false)}>Keep editing</button>{" "}
        <button type="button" className="text-btn" onClick={discard}>Discard draft</button>
      </div>}
      <div className={`composer-foot ${composerStyles.footer}`}>
        <span className="meta">
          <a href="/guidelines">Community guidelines</a>
          <span id={countId} className={body.length >= 1900 ? undefined : composerStyles.srOnly}>
            {body.length >= 1900 ? ` · ${2000 - body.length} characters left` : "2,000 character limit."}
          </span>
          <span aria-live="polite" className={composerStyles.srOnly}>
            {body.length === 2000 ? "Character limit reached." : body.length >= 1980 ? "20 characters or fewer remaining." : ""}
          </span>
          {hasDraft && !confirmDiscard && <> · <button type="button" className="text-btn" onClick={() => setConfirmDiscard(true)}>Discard</button></>}
        </span>
        <button
          type="button"
          className="btn small"
          disabled={action.busy || !canPost || reconsider}
          onClick={() => submit()}
        >
          {action.busy ? "Posting…" : kind === "build" ? "Publish build" : "Post"}
        </button>
      </div>
    </fieldset>
  );
}
