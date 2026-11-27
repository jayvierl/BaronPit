"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { beginDraftSignIn, restoreAfterMount } from "@/lib/auth-draft";
import { QUOTE_LIMIT, type QuotePreview as Original } from "@/lib/quote-types";
import { signInHref } from "@/lib/signin-return";
import { ActionFeedback, usePostAction } from "./post-action";
import { QuotePreview } from "./quote-preview";
import { ThreadIcon } from "./thread-icon";
import { useHydrated } from "./use-hydrated";
import styles from "./quote.module.css";

export function QuoteControl({ original, signedIn, viewerId }: { original: Original; signedIn: boolean; viewerId?: number | null }) {
  const router = useRouter();
  const action = usePostAction();
  const ready = useHydrated();
  const [body, setBody] = useState("");
  const [attempted, setAttempted] = useState("");
  const [notice, setNotice] = useState("");
  const [published, setPublished] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const anchor = `quote-${original.postId}`;
  const returnTo = `/post/${original.postId}#${anchor}`;
  const scope = `quote:${original.postId}`;

  useEffect(() => {
    if (!signedIn) return;
    if (window.location.hash === `#${anchor}` && disclosure.current) disclosure.current.open = true;
    return restoreAfterMount(scope, saved => {
      if (typeof saved.body !== "string") return;
      if (disclosure.current) disclosure.current.open = true;
      setBody(saved.body.slice(0, QUOTE_LIMIT));
      field.current?.focus();
    });
  }, [anchor, scope, signedIn]);

  if (!signedIn) return <a className="action-btn" aria-label="Sign in to quote" title="Sign in to quote" href={signInHref(returnTo)}>
    <ThreadIcon name="quote" />
  </a>;

  const reconsider = action.reconsider && attempted === body;
  async function publish() {
    if (!ready || !body.trim() || action.busy || published) return;
    if (action.authStep) {
      try { router.push(beginDraftSignIn(window.localStorage, scope, returnTo, { body }, action.authStep === "enrol" ? "enrol" : undefined)); }
      catch { setNotice("This browser couldn’t save your draft. Copy your comment before signing in."); }
      return;
    }
    setAttempted(body);
    const result = await action.sendDraft("/api/social/quote", { postId: original.postId, body, expectedAuthorId: viewerId ?? undefined,
      submitForReview: reconsider });
    if (typeof result?.postId === "number") {
      setPublished(true);
      router.push(result.status === "visible" ? `/post/${result.postId}` : "/me#submissions");
    }
  }

  return <details className={styles.control} id={anchor} ref={disclosure} onKeyDown={event => {
    if (event.key === "Escape" && event.currentTarget.open) {
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }
  }}>
    <summary title="Quote post" aria-label="Quote post"><ThreadIcon name="quote" /></summary>
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); void publish(); }}>
      <label>Your comment<textarea ref={field} rows={3} required maxLength={QUOTE_LIMIT} value={body} disabled={!ready || action.busy}
        onChange={event => { setBody(event.target.value); setNotice(""); }}/></label>
      <QuotePreview original={original}/>
      <ActionFeedback error={action.error}/>
      {notice && <p role="status" className="meta">{notice}</p>}
      <button type="submit" className="btn small" disabled={!ready || action.busy || published || !body.trim()}>
        {action.busy ? "Publishing…" : action.authStep === "enrol" ? "Confirm eligibility and continue"
          : action.authStep ? "Sign in to continue" : reconsider ? "Submit for moderator review" : "Publish quote"}
      </button>
    </form>
  </details>;
}
