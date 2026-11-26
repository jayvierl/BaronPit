"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LibraryAction, LibraryKind } from "@/lib/discussion-library";
import { signInHref } from "@/lib/signin-return";
import { ActionFeedback, usePostAction } from "./post-action";

export function ShareDiscussion({ postId }: { postId: number }) {
  const [notice, setNotice] = useState("");
  const [manual, setManual] = useState("");
  async function share() {
    const url = new URL(`/post/${postId}`, window.location.origin).href;
    setNotice("");
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Link copied.");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setManual(url);
    }
  }
  return <>
    <button type="button" className="action-btn" onClick={share}>Share</button>
    {notice && <span className="meta" role="status">{notice}</span>}
    {manual && <input readOnly value={manual} aria-label="Discussion link to copy" onFocus={e => e.target.select()} />}
  </>;
}

function PrivateActions({ kind, id, postId, signedIn }: { kind: LibraryKind; id: number; postId: number; signedIn: boolean }) {
  const [state, setState] = useState<{ saved: boolean; watching: boolean } | null>(null);
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
      setState({ saved: data.saved === true, watching: data.watching === true });
    } catch { setState(null); setError("Couldn’t load your options."); }
    finally { fetching.current = false; }
  }
  async function toggle(which: "save" | "watch") {
    if (!state) return;
    const key = which === "save" ? "saved" : "watching";
    const active = !state[key];
    if (await action.send("/api/library", { action: which, kind, id, active })) setState({ ...state, [key]: active });
  }
  return <details className="library-options" onToggle={e => { if (e.currentTarget.open) void load(); }}>
    <summary>{kind === "comment" ? "Save reply" : "Save or watch"}</summary>
    <div className="library-menu">
      {!signedIn ? <Link href={signInHref(`/post/${postId}` + (kind === "comment" ? `#reply-${id}` : ""))}>Sign in to {kind === "comment" ? "save this reply" : "save or watch this thread"}</Link> :
        state ? <>
          <button type="button" className="text-btn" disabled={action.busy} aria-pressed={state.saved} onClick={() => toggle("save")}>{state.saved ? "Remove from playbook" : "Save to playbook"}</button>
          {kind === "post" && <button type="button" className="text-btn" disabled={action.busy} aria-pressed={state.watching} onClick={() => toggle("watch")}>{state.watching ? "Stop watching" : "Watch replies"}</button>}
          <Link href="/playbook">My playbook</Link>{kind === "post" && <Link href="/activity">Reply activity</Link>}
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

export function LibraryRowAction({ action, kind, id }: { action: LibraryAction; kind: LibraryKind; id: number }) {
  const router = useRouter();
  const write = usePostAction();
  const [done, setDone] = useState(false);
  const label = action === "watch" ? "Stop watching" : action === "read" ? "Mark as read" : "Remove";
  return <>
    <button type="button" className="text-btn" disabled={write.busy || done} onClick={async () => {
      if (await write.send("/api/library", { action, kind, id, active: action === "read" })) { setDone(true); router.refresh(); }
    }}>{done ? (action === "watch" ? "Unwatched" : action === "read" ? "Read" : "Removed") : label}</button>
    <ActionFeedback error={write.error} />
  </>;
}
