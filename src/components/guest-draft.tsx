"use client";
import styles from "./thread.module.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { beginDraftSignIn } from "@/lib/auth-draft";
import { POST_TO_THE_PIT } from "@/lib/brand";
import { signInHref } from "@/lib/signin-return";
import { useHydrated } from "./use-hydrated";

export function GuestPostDraft({roomId, destination, label, anchorId = "compose", onDraftChange}: {
  roomId?: number; destination: string; label: string; anchorId?: string | null; onDraftChange?: (hasDraft: boolean) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const hydrated = useHydrated();
  const [error, setError] = useState("");
  const router = useRouter();
  const signIn = signInHref(destination);

  useEffect(() => {
    onDraftChange?.(Boolean(textarea.current?.value.trim()));
  }, [onDraftChange]);

  function continueToSignIn() {
    const body = textarea.current?.value ?? "";
    if (!body.trim()) { router.push(signIn); return; }
    try {
      const href = beginDraftSignIn(window.localStorage, `post:${roomId ?? "home"}`, destination, {body});
      router.push(href);
    } catch { setError("This browser couldn’t save your draft. Copy it before signing in, or allow site storage and try again."); }
  }

  return <div id={anchorId ?? undefined} role="form" className={`composer ${styles.editor}`} aria-label={roomId === undefined ? POST_TO_THE_PIT : label}>
    <label className={styles.guestLabel}>
      <strong>{label}</strong>
      <textarea ref={textarea} rows={2} placeholder="What’s on your mind?" maxLength={2000}
        onChange={event => onDraftChange?.(Boolean(event.currentTarget.value.trim()))} />
    </label>
    {error && <p className="notice err" role="alert">{error} <a href={signIn}>Open sign-in</a></p>}
    <div className="composer-foot">
      {hydrated && <small className="meta">Your draft stays in this browser during sign-in.</small>}
      <button type="button" className="btn small" disabled={!hydrated} onClick={continueToSignIn}>Sign in to post</button>
    </div>
    <noscript><p className="meta">Copy your draft before signing in. <a href={signIn}>Open sign-in</a></p></noscript>
  </div>;
}
