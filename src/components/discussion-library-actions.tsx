"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LibraryAction, LibraryKind, ReplyMode } from "@/lib/discussion-library";
import { signInHref } from "@/lib/signin-return";
import { ActionFeedback, usePostAction } from "./post-action";
import { ShareLink } from "./share-link";
import { ThreadIcon } from "./thread-icon";

export function ShareDiscussion({ postId }: { postId: number }) {
  return <ShareLink path={`/post/${postId}`} kind="thread" />;
}

function PrivateActions({ kind, id, postId, signedIn }: { kind: LibraryKind; id: number; postId: number; signedIn: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ saved: boolean; replyMode: ReplyMode } | null>(null);
  const [error, setError] = useState("");
  const fetching = useRef(false);
  const action = usePostAction();
  async function load() {
    if (fetching.current || !signedIn) return;
    fetching.current = true;
    setState(null);
    setError("");
    try {
      const response = await fetch(`/api/library?kind=${kind}&id=${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error("unavailable");
      setState({ saved: data.saved === true, replyMode: data.replyMode });
    } catch { setState(null); setError("Couldn’t load your options."); }
    finally { fetching.current = false; }
  }
  async function toggleSave() {
    if (!state) return;
    const active = !state.saved;
    if (await action.send("/api/library", { action: "save", kind, id, active })) setState({ ...state, saved: active });
  }
  async function setMode(mode: ReplyMode) {
    if (!state || state.replyMode === mode) return;
    if (await action.send("/api/library", { action: "reply-mode", kind, id, mode })) {
      setState({ ...state, replyMode: mode });
      router.refresh();
    }
  }
  return <details className="library-options" onToggle={e => { if (e.currentTarget.open) void load(); }}>
    <summary aria-label={kind === "comment" ? "Save reply" : "Save and manage thread notifications"} title={kind === "comment" ? "Save reply" : "Save and manage thread notifications"}>
      {kind === "comment" ? "Save reply" : <ThreadIcon name="save" />}
    </summary>
    <div className="library-menu">
      {!signedIn ? <Link href={signInHref(`/post/${postId}` + (kind === "comment" ? `#reply-${id}` : ""))}>Sign in to {kind === "comment" ? "save this reply" : "save or watch this thread"}</Link> :
        state ? <>
          <button type="button" className="text-btn" disabled={action.busy} aria-pressed={state.saved} onClick={toggleSave}>{state.saved ? "Remove from saved" : kind === "comment" ? "Save this reply" : "Save this post"}</button>
          {kind === "post" && <label>Reply notifications
            <select value={state.replyMode} disabled={action.busy} onChange={e => setMode(e.target.value as ReplyMode)}>
              <option value="direct">Replies to me</option>
              <option value="all">All replies</option>
              <option value="muted">Mute this thread</option>
            </select>
          </label>}
          <Link href={kind === "comment" ? "/playbook?tab=replies" : "/playbook?tab=posts"}>{kind === "comment" ? "View saved replies" : "View saved posts"}</Link>
          {kind === "post" && <Link href={state.replyMode === "all" ? "/activity?tab=watching" : state.replyMode === "muted" ? "/activity?tab=muted" : "/activity"}>
            {state.replyMode === "all" ? "View watched discussions" : state.replyMode === "muted" ? "View muted discussions" : "Reply activity"}
          </Link>}
        </> : error ? <span role="alert">{error} <button type="button" className="text-btn" onClick={load}>Retry</button></span> : <span role="status">Loading…</span>}
      <ActionFeedback error={action.error} />
    </div>
  </details>;
}

export function PostLibraryActions({ postId, signedIn }: { postId: number; signedIn: boolean }) {
  return <><ShareDiscussion postId={postId} /><PrivateActions kind="post" id={postId} postId={postId} signedIn={signedIn} /></>;
}
export function SaveReply({ replyId, postId, signedIn }: { replyId: number; postId: number; signedIn: boolean }) {
  return <PrivateActions kind="comment" id={replyId} postId={postId} signedIn={signedIn} />;
}

const rowControls = {
  unwatch: { action: "watch", active: false, label: "Stop watching", done: "Unwatched" },
  read: { action: "read", active: true, label: "Mark as read", done: "Read" },
  remove: { action: "save", active: false, label: "Remove", done: "Removed" },
  mute: { action: "mute", active: true, label: "Mute thread", done: "Muted" },
  unmute: { action: "mute", active: false, label: "Resume replies to me", done: "Resumed" },
} satisfies Record<string, { action: LibraryAction; active: boolean; label: string; done: string }>;

export function LibraryRowAction({ action, kind, id }: { action: keyof typeof rowControls; kind: LibraryKind; id: number }) {
  const router = useRouter();
  const write = usePostAction();
  const [done, setDone] = useState(false);
  const control = rowControls[action];
  return <>
    <button type="button" className="text-btn" disabled={write.busy || done} onClick={async () => {
      if (await write.send("/api/library", { action: control.action, kind, id, active: control.active })) { setDone(true); router.refresh(); }
    }}>{done ? control.done : control.label}</button>
    <ActionFeedback error={write.error} />
  </>;
}
