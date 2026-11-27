"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { beginDraftSignIn, restoreAfterMount } from "@/lib/auth-draft";
import { QUOTE_LIMIT, type QuotePreview as Original } from "@/lib/quote-types";
import { signInHref } from "@/lib/signin-return";
import { ActionFeedback, usePostAction } from "./post-action";
import { TagFieldWrap, useTagSuggest } from "./tag-suggest";
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
  const tags = useTagSuggest({
    inputRef: field, value: body, limit: QUOTE_LIMIT, enabled: signedIn && !action.busy,
    apply: next => { setBody(next); setNotice(""); },
  });
  const anchor = `quote-${original.postId}`;
  const returnTo = `/post/${original.postId}#${anchor}`;
  const scope = `quote:${original.postId}`;

  useEffect(() => {
    if (!signedIn) return;
    function openEditor() {
      const editor = disclosure.current;
      if (!editor) return;
      const options = editor.parentElement?.closest("details");
      if (options) options.open = true;
      editor.open = true;
    }
    if (window.location.hash === `#${anchor}`) openEditor();
    return restoreAfterMount(scope, saved => {
      if (typeof saved.body !== "string") return;
      openEditor();
      setBody(saved.body.slice(0, QUOTE_LIMIT));
      field.current?.focus();
    });
  }, [anchor, scope, signedIn]);

  if (!signedIn) return <a className="action-btn" aria-label="Sign in to quote" title="Sign in to quote" href={signInHref(returnTo)}>
    <ThreadIcon name="quote" /> Quote post
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

  return <details id={anchor} ref={disclosure} onKeyDown={event => {
    if (event.key === "Escape" && event.currentTarget.open) {
      event.stopPropagation();
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }
  }}>
    <summary title="Quote post" aria-label="Quote post"><ThreadIcon name="quote" /> Quote post</summary>
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); void publish(); }}>
      <label htmlFor={`${anchor}-body`}>Your comment</label>
      <TagFieldWrap>
        <textarea id={`${anchor}-body`} ref={field} {...tags.fieldProps} rows={3} required
          maxLength={tags.maxLength} value={tags.display} disabled={!ready || action.busy}
          onChange={event => tags.change(event.currentTarget)}/>
        {tags.menu}
      </TagFieldWrap>
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
