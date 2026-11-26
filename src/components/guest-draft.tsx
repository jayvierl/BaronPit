"use client";
import styles from "./thread.module.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { beginDraftSignIn } from "@/lib/auth-draft";
import { POST_TO_THE_PIT } from "@/lib/brand";
import { signInHref } from "@/lib/signin-return";

export function GuestPostDraft({roomId, destination, label, anchorId = "compose", onDraftChange}: {
  roomId?: number; destination: string; label: string; anchorId?: string | null; onDraftChange?: (hasDraft: boolean) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return <form id={anchorId ?? undefined} className={`composer ${styles.editor}`} aria-label={roomId === undefined ? POST_TO_THE_PIT : undefined} onSubmit={event => {
    event.preventDefault();
    if (!body.trim()) { router.push(signInHref(destination)); return; }
    try {
      const href = beginDraftSignIn(window.localStorage, `post:${roomId ?? "home"}`, destination, {body});
      router.push(href);
    } catch { setError("This browser couldn’t save your draft. Copy it before signing in, or allow site storage and try again."); }
  }}>
    <label className={styles.guestLabel}>
      <strong>{label}</strong>
      <textarea rows={2} placeholder="What’s on your mind?" maxLength={2000} value={body} onChange={event => {
        setBody(event.target.value);
        onDraftChange?.(Boolean(event.target.value.trim()));
      }} />
    </label>
    {error && <p className="notice err" role="alert">{error}</p>}
    <div className="composer-foot">
      <small className="meta">Your draft stays in this browser during sign-in.</small>
      <button type="submit" className="btn small">Sign in to post</button>
    </div>
  </form>;
}
