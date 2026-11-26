"use client";

import { beginDraftSignIn, currentAppPath, restoreAfterMount } from "@/lib/auth-draft";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { clipLink } from "@/lib/clip-link";
import { BARON_CALL_OPTIONS } from "@/lib/poll";
import { ActionFeedback, usePostAction } from "./post-action";
import { Avatar } from "./ui";
import styles from "./thread.module.css";

type Kind = "text" | "build" | "poll" | "clip";

export function Composer({
  roomId,
  patch,
  champions,
  userName,
  userHue,
}: {
  roomId?: number;
  patch: string;
  champions: string[];
  userName?: string;
  userHue?: number;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("text");
  const [body, setBody] = useState("");
  const [champion, setChampion] = useState("");
  const [items, setItems] = useState<number[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [itemMap, setItemMap] = useState<Record<string, number>>({});
  const [runes, setRunes] = useState("");
  const [offMeta, setOffMeta] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [baronCall, setBaronCall] = useState(false);
  const [clipUrl, setClipUrl] = useState("");
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const action = usePostAction();
  const [itemError, setItemError] = useState(false);
  const [retry, setRetry] = useState(0);
  const champListId = useId();

  const scope = `post:${roomId ?? "home"}`;
  useEffect(() => restoreAfterMount(scope, draft => {
    const mode = draft.kind;
    if (mode === "build" || mode === "clip" || mode === "poll") setKind(mode);
    if (typeof draft.body === "string") setBody(draft.body.slice(0, 2000));
    if (typeof draft.champion === "string") setChampion(draft.champion);
    if (Array.isArray(draft.items)) setItems(draft.items.filter(Number.isSafeInteger).slice(0, 6));
    if (typeof draft.runes === "string") setRunes(draft.runes);
    if (typeof draft.clipUrl === "string") setClipUrl(draft.clipUrl);
    if (Array.isArray(draft.options) && draft.options.every(o => typeof o === "string")) setOptions(draft.options.slice(0, 4));
    setOffMeta(draft.offMeta === true);
    setBaronCall(draft.baronCall === true);
    setMsg({tone: "ok", text: "Your draft is ready to review."});
    bodyRef.current?.focus();
  }), [scope]);

  function resumeAfterAuth() {
    try {
      const path = currentAppPath().split("#")[0] + "#compose";
      const href = beginDraftSignIn(window.localStorage, scope, path,
        {kind, body, champion, items, runes, offMeta, options, baronCall, clipUrl}, action.authStep === "enrol" ? "enrol" : undefined);
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
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const reconsider = action.reconsider && attempted === submissionKey;
  async function submit(submitForReview = false) {
    if (!canPost || action.busy) return;
    setMsg(null);
    setAttempted(submissionKey);
    const result = await action.sendDraft("/api/social/post", {
      ...payload,
      submitForReview: submitForReview && reconsider,
    });
    if (!result) return;
    const held = result.status === "held";
    setMsg({
      tone: held ? "warn" : "ok",
      text: held ? "Submitted for moderator review." : result.status === "visible" ? "Posted." : "Your earlier submission is recorded in My submissions.",
    });
    setBody("");
    setChampion("");
    setItems([]);
    setItemQuery("");
    setOffMeta(false);
    setRunes("");
    setOptions(["", ""]);
    setBaronCall(false);
    setClipUrl("");
    router.refresh();
  }

  const itemNames = Object.keys(itemMap)
    .filter((n) => n.toLowerCase().includes(itemQuery.toLowerCase()))
    .slice(0, 8);

  return (
    <fieldset
      disabled={action.busy}
      className={`composer ${styles.editor}`}
      id="compose"
      aria-label="Start a thread"
    >
      <div className="composer-head">
        {userName != null && <Avatar name={userName} hue={userHue ?? 0} size={40} />}
        <textarea
          ref={bodyRef}
          aria-label="Post text"
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
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
        />
      </div>
      <div className={`kind-tabs ${styles.formats}`} role="group" aria-label="Post format">
        {(["text", "build", "poll", "clip"] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            disabled={action.busy}
            className={`kind-tab${kind === k ? " active" : ""}`}
            onClick={() => setKind(k)}
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
              list={champListId}
              placeholder="Champion"
              value={champion}
              onChange={(e) => setChampion(e.target.value)}
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
              placeholder="Runes (e.g. Conqueror · Triumph…)"
              value={runes}
              onChange={(e) => setRunes(e.target.value)}
              style={{ flex: "2 1 220px" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              className="inline"
              aria-label="Search items"
              placeholder="Search items to add (up to 6)"
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
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
                    if (items.length < 6) setItems([...items, itemMap[n]]);
                    setItemQuery("");
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
                onClick={() => setItems(items.filter((_, j) => j !== i))}
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
            <input type="checkbox" checked={offMeta} onChange={(e) => setOffMeta(e.target.checked)} /> This is an
            off-meta build
          </label>
        </div>
      )}
      {kind === "poll" && (
        <div className="composer-extra" style={{ marginTop: 4, display: "grid", gap: 8 }}>
          <label>
            <input type="checkbox" checked={baronCall} onChange={e => setBaronCall(e.target.checked)} /> Make it a Baron call
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
                setOptions(next);
              }}
            />
          ))}
          {!baronCall && options.length < 4 && (
            <button type="button" className="text-btn" onClick={() => setOptions([...options, ""])}>
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
            type="url"
            placeholder="YouTube, Twitch, Medal or Streamable clip URL"
            value={clipUrl}
            onChange={(e) => setClipUrl(e.target.value)}
            style={{ width: "100%" }}
          />
          <p className="meta" style={{ margin: "6px 0 0" }}>
            A moderator reviews your clip link before it appears. Other players can choose to open it on the host
            site.
          </p>
        </div>
      )}
      {attempted === submissionKey && <ActionFeedback error={action.error} />}
      {action.authStep && <button type="button" className="text-btn" onClick={resumeAfterAuth}>
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
        <div role="status" className={`notice ${msg.tone}`} style={{ marginLeft: 52 }}>
          {msg.text} {msg.tone !== "err" && <a href="/me#submissions">My submissions</a>}
        </div>
      )}
      <div className="composer-foot">
        <span className="meta">
          <a href="/guidelines">Community guidelines</a>{body.length >= 1800 && ` · ${2000 - body.length} characters left`}
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
