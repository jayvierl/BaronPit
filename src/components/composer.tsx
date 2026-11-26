"use client";

import { beginDraftSignIn, consumeAuthDraft, currentAppPath } from "@/lib/auth-draft";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { clearTabDrafts, COMPOSER_SIGNOUT, emptyPostDraft, hasPostDraft, openTabDraft, postReceipt, readPostDraft, type PostDraft, type PostKind } from "@/lib/composer-draft";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { clipLink } from "@/lib/clip-link";
import { BARON_CALL_OPTIONS } from "@/lib/poll";
import { ActionFeedback, usePostAction } from "./post-action";
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
}: {
  roomId?: number;
  patch: string;
  champions: string[];
  viewerIdentity?: AvatarIdentity | null;
  viewerId: number;
  anchorId?: string | null;
  onDraftChange?: (hasDraft: boolean) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyPostDraft);
  const live = useRef(draft);
  const storage = useRef<ReturnType<typeof openTabDraft> | null>(null);
  const touched = useRef(false);
  const { kind, body, champion, items, itemQuery, runes, offMeta, options, baronCall, clipUrl } = draft;
  const [itemMap, setItemMap] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<Notice | null>(null);
  const action = usePostAction();
  const [itemError, setItemError] = useState(false);
  const [retry, setRetry] = useState(0);
  const champListId = useId();

  const scope = `post:${roomId ?? "home"}`;
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
      const restored = transferred ?? storage.current?.restored;
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
      live.current = emptyPostDraft;
      setDraft(emptyPostDraft);
      setMsg(null);
      setConfirmDiscard(false);
      router.refresh();
    }
    window.addEventListener("storage", signedOut);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("storage",signedOut); };
  }, [scope,viewerId,router]);

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
  function discard() {
    store(emptyPostDraft);
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
        const catalog: {patch:string;items:Record<string,number>} = await r.json();
        if (catalog.patch !== patch) throw new Error("Current patch items unavailable");
        const items = catalog.items;
        if (!controller.signal.aborted) {
          setItemMap(items);
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
  const canPost =
    kind === "build"
      ? !!knownChampion && items.length > 0 && !!body.trim()
      : kind === "poll"
        ? body.trim().length >= 3 &&
          selectedOptions.length >= 2 &&
          new Set(selectedOptions.map(o => o.toLowerCase())).size === selectedOptions.length
        : kind === "clip"
          ? !!clipLink(clipUrl)
          : !!body.trim();

  const data =
    kind === "build"
      ? { champion: knownChampion, items, runes, offMeta }
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
    store(emptyPostDraft);
    setConfirmDiscard(false);
    setMsg(postReceipt(result));
    router.refresh();
  }

  const itemNames = Object.keys(itemMap)
    .filter((n) => n.toLowerCase().includes(itemQuery.toLowerCase()))
    .slice(0, 8);

  return (
    <fieldset
      disabled={action.busy}
      className={`composer ${styles.editor}`}
      id={anchorId ?? undefined}
      aria-label="Start a thread"
    >
      <div className="composer-head">
        {viewerIdentity && <Avatar {...viewerIdentity} size={40} />}
        <textarea
          ref={bodyRef}
          aria-label="Post text"
          aria-describedby={countId}
          disabled={action.busy}
          rows={2}
          placeholder={
            kind === "build"
              ? "When would you play this build?"
              : kind === "poll"
                ? "What should the room vote on?"
                : kind === "clip"
                  ? "What happened in the clip?"
                  : "What’s on your mind?"
          }
          value={body}
          onChange={(e) => edit({ body: e.target.value })}
          maxLength={2000}
        />
      </div>
      <div className={`kind-tabs ${styles.formats}`} role="group" aria-label="Post format">
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
      </div>
      {kind === "build" && (
        <div className="composer-extra" style={{ marginTop: 4 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="inline"
              aria-label="Champion"
              maxLength={100}
              list={champListId}
              placeholder="Champion"
              value={champion}
              onChange={(e) => edit({ champion: e.target.value })}
              style={{ flex: "1 1 150px" }}
            />
            <datalist id={champListId}>
              {champions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <input
              className="inline"
              aria-label="Runes"
              maxLength={240}
              placeholder="Runes (e.g. Conqueror · Triumph…)"
              value={runes}
              onChange={(e) => edit({ runes: e.target.value })}
              style={{ flex: "2 1 220px" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              className="inline"
              aria-label="Search items"
              maxLength={120}
              placeholder="Search items to add (up to 6)"
              value={itemQuery}
              onChange={(e) => edit({ itemQuery: e.target.value })}
              style={{ flex: 1 }}
            />
          </div>
          {itemError && (
            <p role="alert">
              Item names couldn’t load.{" "}
              <button type="button" className="text-btn" onClick={() => setRetry((n) => n + 1)}>
                Retry
              </button>
            </p>
          )}
          {itemQuery && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {itemNames.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={items.length >= 6 || action.busy}
                  className="chip"
                  onClick={() => {
                    if (items.length < 6) edit({ items: [...items, itemMap[n]], itemQuery: "" });
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <div className="build-items">
            {items.map((id, i) => (
              <button
                key={i}
                type="button"
                className="text-btn"
                disabled={action.busy}
                aria-label={`Remove ${Object.keys(itemMap).find((name) => itemMap[name] === id) ?? "item " + id}`}
                onClick={() => edit({ items: items.filter((_, j) => j !== i) })}
              >
                <Image
                  src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`}
                  width={32}
                  height={32}
                  unoptimized
                  alt=""
                />
              </button>
            ))}
          </div>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
            <input type="checkbox" checked={offMeta} onChange={(e) => edit({ offMeta: e.target.checked })} /> This is an
            off-meta build
          </label>
        </div>
      )}
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
          <span id={countId} className={body.length ? undefined : composerStyles.srOnly}>
            {body.length > 0 ? ` · ${2000 - body.length} characters left` : "2,000 character limit."}
          </span>
          <span aria-live="polite" className={composerStyles.srOnly}>
            {body.length === 2000 ? "Character limit reached." : body.length >= 1980 ? "20 characters or fewer remaining." : ""}
          </span>
          {hasPostDraft(draft) && !confirmDiscard && <> · <button type="button" className="text-btn" onClick={() => setConfirmDiscard(true)}>Discard</button></>}
        </span>
        <button
          type="button"
          className="btn small"
          disabled={action.busy || !canPost || reconsider}
          onClick={() => submit()}
        >
          {action.busy ? "Posting…" : "Post"}
        </button>
      </div>
    </fieldset>
  );
}
