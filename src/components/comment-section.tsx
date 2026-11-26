"use client";

import { useRouter } from "next/navigation";
import { beginDraftSignIn, restoreAfterMount } from "@/lib/auth-draft";
import { signInHref } from "@/lib/signin-return";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CommentView } from "@/lib/social";
import { WithdrawSubmission } from "./withdraw-submission";
import { Avatar, timeAgo } from "./ui";
import { ActionFeedback, usePostAction } from "./post-action";
import { SaveReply } from "./discussion-library-actions";
import styles from "@/app/questions/questions.module.css";
import threadStyles from "./thread.module.css";
import { SafetyReport } from "./safety-report";

type ThreadLoad = { postId: number; revision: number; visit: number } & (
  | { comments: CommentView[]; error?: never }
  | { error: string; comments?: never }
);

export function CommentSection({
  postId,
  active = true,
  visit = 1,
  signedIn,
  viewerId,
  viewerName,
  viewerHue,
  allowOneFix,
  decisionQuestion,
  onVisibleReply,
}: {
  postId: number;
  active?: boolean;
  visit?: number;
  signedIn: boolean;
  viewerId?: number | null;
  viewerName?: string;
  viewerHue?: number;
  allowOneFix?: boolean;
  decisionQuestion?: boolean;
  onVisibleReply?: () => void;
}) {
  const router = useRouter();
  const [thread, setThread] = useState<ThreadLoad | null>(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ rootId: number; name: string } | null>(null);
  const [oneFix, setOneFix] = useState(false);
  const [notice, setNotice] = useState("");
  const action = usePostAction();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const setInputRef = (el: HTMLInputElement | HTMLTextAreaElement | null) => { inputRef.current = el; };

  const scope = `reply:${postId}`;
  useEffect(() => {
    if (!signedIn) return;
    return restoreAfterMount(scope, saved => {
      if (typeof saved.body !== "string") return;
      setDraft(saved.body.slice(0, 1000));
      if (typeof saved.rootId === "number" && Number.isSafeInteger(saved.rootId) && typeof saved.name === "string") {
        setReplyTo({rootId: saved.rootId, name: saved.name});
      }
      setOneFix(saved.oneFix === true);
      setNotice("Your reply is ready to review.");
      inputRef.current?.focus();
    });
  }, [scope, signedIn]);

  function resumeAfterAuth() {
    const destination = `/post/${postId}#replies-${postId}`;
    const mode = action.authStep === "enrol" ? "enrol" : undefined;
    if (!draft.trim()) { router.push(signInHref(destination, mode)); return; }
    try {
      router.push(beginDraftSignIn(window.localStorage, scope, destination,
        {body: draft, rootId: replyTo?.rootId, name: replyTo?.name, oneFix}, mode));
    } catch { setNotice("This browser couldn’t save your reply. Copy it before signing in."); }
  }
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/social/comments?postId=${postId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || data.ok !== true || !Array.isArray(data.comments)) throw new Error("Unavailable");
        if (!controller.signal.aborted) setThread({ postId, revision, visit, comments: data.comments });
      } catch {
        if (!controller.signal.aborted) setThread({ postId, revision, visit, error: "Replies couldn’t load." });
      }
    }
    void load();
    return () => controller.abort();
  }, [active, postId, revision, visit]);

  const lastAnchor = useRef("");
  useEffect(() => {
    if (thread?.comments && lastAnchor.current !== window.location.hash && /^#reply-\d+$/.test(window.location.hash)) {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target) {
        target.scrollIntoView({block:"center"});
        lastAnchor.current = window.location.hash;
      }
    }
  },[thread]);

  const payload = {
    postId,
    body: draft.trim(),
    parentId: replyTo?.rootId,
    oneFix: !!allowOneFix && oneFix && !replyTo,
  };
  const submissionKey = JSON.stringify(payload);
  const [attempted, setAttempted] = useState("");
  const reconsider = action.reconsider && attempted === submissionKey;
  async function submit(submitForReview = false) {
    if (!signedIn) { resumeAfterAuth(); return; }
    if (!draft.trim() || action.busy || (reconsider && !submitForReview)) return;
    setNotice("");
    setAttempted(submissionKey);
    const result = await action.sendDraft("/api/social/comments", {
      ...payload,
      submitForReview: submitForReview && reconsider,
    });
    if (!result) return;
    setDraft("");
    setReplyTo(null);
    setOneFix(false);
    if (result.status === "held") setNotice("Your reply is awaiting moderator review.");
    else if (result.status !== "visible") setNotice("Your earlier submission is recorded in My submissions.");
    else {
      setNotice("Reply posted.");
      onVisibleReply?.();
    }
    setRevision((r) => r + 1);
  }

  function showComment(c: CommentView, rootId: number, depth: number): React.ReactNode {
    return (
      <div key={c.id} id={`reply-${c.id}`} className={threadStyles.replyBranch}>
        <div className="comment-row">
          <div className="comment-rail">
            <Link href={`/u/${c.authorId}`} aria-label={`${c.authorName}’s profile`}>
              <Avatar name={c.authorName} hue={c.authorHue} size={32} />
            </Link>
            {c.replies.length > 0 && <span className="line" />}
          </div>
          <div className="comment-main">
            <div>
              <Link href={`/u/${c.authorId}`} className="post-author">
                {c.authorName}
              </Link>{" "}
              <Link href={`/post/${postId}#reply-${c.id}`} className={threadStyles.permalink}
                aria-label={`Link to reply by ${c.authorName}`}>
                <time className="time" dateTime={c.createdAt} suppressHydrationWarning>{timeAgo(c.createdAt)}</time>
              </Link>
            </div>
            <div className="post-body">
              {c.oneFix && <span className="onefix-tag">One fix</span>}
              {c.body}
            </div>
            {c.status === "held" && <span className="meta">Awaiting review</span>}
            <div className={threadStyles.replyActions}>
              <button
                type="button"
                className="text-btn"
                aria-label={`Reply to ${c.authorName}`}
                onClick={() => {
                  setReplyTo({ rootId, name: c.authorName });
                  setOneFix(false);
                  inputRef.current?.focus();
                }}
              >
                Reply
              </button>
              <SaveReply replyId={c.id} postId={postId} signedIn={signedIn}/>
              {signedIn && viewerId === c.authorId ? <WithdrawSubmission kind="comment" id={c.id} onWithdraw={()=>setRevision(r=>r+1)}/> : <SafetyReport kind="comment" targetId={c.id}/>}
            </div>
          </div>
        </div>
        {c.replies.length > 0 && <div className={depth === 0 ? threadStyles.children : undefined}>
          {c.replies.map((child) => showComment(child, rootId, depth + 1))}
        </div>}
      </div>
    );
  }

  const current = thread?.postId === postId && thread.revision === revision && thread.visit === visit ? thread : null;
  return (
    <section id={`replies-${postId}`} className="comments" aria-labelledby={`replies-title-${postId}`}>
      <h2 className={threadStyles.repliesTitle} id={`replies-title-${postId}`}>Replies</h2>
      {!current ? (
        <p className="meta" role="status">
          Loading replies…
        </p>
      ) : current.comments ? (
        current.comments.length ? (
          current.comments.map((c) => showComment(c, c.id, 0))
        ) : (
          <p className="meta">No replies yet.</p>
        )
      ) : (
        <p role="alert">
          {current.error}{" "}
          <button type="button" className="text-btn" onClick={() => setRevision((r) => r + 1)}>
            Retry
          </button>
        </p>
      )}
      {attempted === submissionKey && <ActionFeedback error={action.error} />}
      {reconsider && (
        <div>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setAttempted("");
              inputRef.current?.focus();
            }}
          >
            Edit reply
          </button>{" "}
          <button
            type="button"
            className="btn small secondary"
            disabled={action.busy}
            onClick={() => submit(true)}
          >
            Submit reply for review
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="meta">
          {notice} {signedIn && <Link href="/me#submissions">My submissions</Link>}
        </p>
      )}
      {signedIn && action.authStep && <button type="button" className="text-btn" onClick={resumeAfterAuth}>
        {action.authStep === "enrol" ? "Confirm eligibility and return to reply" : "Sign in and return to reply"}
      </button>}
        <form className={threadStyles.replyForm}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {allowOneFix && !replyTo && (
            <label className="meta">
              <input type="checkbox" checked={oneFix} onChange={(e) => setOneFix(e.target.checked)} /> Suggest one
              fix for the next game
            </label>
          )}
          {replyTo && (
            <p className="meta">
              Replying to {replyTo.name}{" "}
              <button type="button" className="text-btn" onClick={() => setReplyTo(null)}>
                Cancel
              </button>
            </p>
          )}
          {decisionQuestion && !replyTo && (
            <details className={styles.replyGuide}>
              <summary>Help me frame my answer</summary>
              <p>What would you do? Why would it work here? When would you choose differently?</p>
              <p className="meta">For example, “I’d recall after crashing the wave so we can buy together. If it’s frozen at their tower, I’d ask my duo to help push first.”</p>
            </details>
          )}
          <div className="reply-composer">
            {viewerName && <Avatar name={viewerName} hue={viewerHue ?? 0} size={32} />}
            {decisionQuestion ? (
              <textarea ref={setInputRef} className={styles.replyInput} aria-label="Your reply" rows={3}
                disabled={action.busy} placeholder="What would you try in this game?" value={draft}
                onChange={e => setDraft(e.target.value)} maxLength={1000} />
            ) : <input
              ref={setInputRef}
              disabled={action.busy}
              aria-label="Your reply"
              placeholder={oneFix ? "What would you change, and why?" : "Add your reply…"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
            />}
            <button type="submit" className="btn small" disabled={action.busy || (signedIn && !draft.trim()) || reconsider}>
              {action.busy ? "Sending…" : signedIn ? "Reply" : "Sign in to reply"}
            </button>
          </div>
        </form>
    </section>
  );
}
