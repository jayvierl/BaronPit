"use client";

import { useRouter } from "next/navigation";
import { beginDraftSignIn, restoreAfterMount } from "@/lib/auth-draft";
import { validId } from "@/lib/ids";
import { signInHref } from "@/lib/signin-return";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { CommentView } from "@/lib/social";
import type { AvatarIdentity } from "@/lib/author-identity";
import { PostCardLoading } from "./post-card-loading";
import { WithdrawSubmission } from "./withdraw-submission";
import { Avatar, AvatarProfileLink, PermalinkTime } from "./ui";
import { ActionFeedback, usePostAction } from "./post-action";
import { SaveReply } from "./discussion-library-actions";
import { useHydrated } from "./use-hydrated";
import styles from "@/app/questions/questions.module.css";
import threadStyles from "./thread.module.css";
import { SafetyReport } from "./safety-report";

type ThreadLoad = { postId: number; revision: number; visit: number } & (
  | { comments: CommentView[]; error?: never }
  | { error: string; comments?: never }
);

function readReplyAnchor() {
  const match = /^#reply-(\d+)$/.exec(window.location.hash);
  const id = match ? Number(match[1]) : null;
  return validId(id) ? id : null;
}

function subscribeToReplyAnchor(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const skipReplyAnchor = () => () => {};
const noReplyAnchor = () => null;

function revealReply(section: HTMLElement | null, id: number) {
  const target = document.getElementById(`reply-${id}`);
  if (!section || !target || !section.contains(target)) return false;
  for (let ancestor = target.parentElement; ancestor && ancestor !== section; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
  }
  target.scrollIntoView({ block: "start" });
  target.focus({ preventScroll: true });
  return true;
}

function visibleReplyCount(comments: CommentView[]): number {
  return comments.reduce((count, reply) => count + 1 + visibleReplyCount(reply.replies), 0);
}

export function CommentSection({
  postId,
  active = true,
  visit = 1,
  threadPage = false,
  initialComments,
  signedIn,
  viewerId,
  viewerIdentity,
  repliesClosed = false,
  allowOneFix,
  decisionQuestion,
  onReplyCount,
}: {
  postId: number;
  active?: boolean;
  visit?: number;
  threadPage?: boolean;
  initialComments?: CommentView[] | null;
  signedIn: boolean;
  viewerId?: number | null;
  viewerIdentity?: AvatarIdentity | null;
  repliesClosed?: boolean;
  allowOneFix?: boolean;
  decisionQuestion?: boolean;
  onReplyCount?: (count: number) => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [thread, setThread] = useState<ThreadLoad | null>(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<number | "reselect" | null>(null);
  const [oneFix, setOneFix] = useState(false);
  const [notice, setNotice] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const sectionRef = useRef<HTMLElement>(null);
  const action = usePostAction();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const oneFixRef = useRef<HTMLInputElement>(null);
  const linkedReply = useSyncExternalStore(threadPage ? subscribeToReplyAnchor : skipReplyAnchor,
    threadPage ? readReplyAnchor : noReplyAnchor, noReplyAnchor);
  const setInputRef = (el: HTMLInputElement | HTMLTextAreaElement | null) => { inputRef.current = el; };

  const scope = `reply:${postId}`;
  const destination = `/post/${postId}#replies-${postId}`;
  useEffect(() => {
    if (!signedIn) return;
    return restoreAfterMount(scope, saved => {
      if (typeof saved.body !== "string") return;
      setDraft(saved.body.slice(0, 1000));
      const hasStoredTarget = "parentId" in saved || "rootId" in saved;
      const target = validId(saved.parentId) ? saved.parentId : hasStoredTarget ? "reselect" : null;
      setReplyTo(target);
      setOneFix(saved.oneFix === true && target === null);
      setNotice("Your reply is ready to review.");
      inputRef.current?.focus();
    });
  }, [scope, signedIn]);

  const useInitial = initialComments != null && visit === 1 && revision === 0;
  useEffect(() => {
    if (!active || useInitial) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/social/comments?postId=${postId}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: { "x-expected-viewer": String(viewerId ?? "guest") },
        });
        if (controller.signal.aborted) return;
        if (response.status === 409) {
          setThread({ postId, revision, visit, error: "Your signed-in account changed. Refresh to see replies." });
          return;
        }
        const data = await response.json();
        if (!response.ok || data.ok !== true || !Array.isArray(data.comments)) throw new Error("Unavailable");
        if (!controller.signal.aborted) {
          onReplyCount?.(visibleReplyCount(data.comments));
          setThread({ postId, revision, visit, comments: data.comments });
        }
      } catch {
        if (!controller.signal.aborted) setThread({ postId, revision, visit, error: "Replies couldn’t load." });
      }
    }
    void load();
    return () => controller.abort();
  }, [active, postId, revision, visit, useInitial, onReplyCount, viewerId]);

  const current: ThreadLoad | null = useInitial
    ? { postId, revision, visit, comments: initialComments }
    : thread?.postId === postId && thread.revision === revision && thread.visit === visit ? thread : null;
  const renderedComments = current?.comments;
  const { counts: replyCounts, commentsById } = useMemo(() => {
    const counts = new Map<number, number>();
    const commentsById = new Map<number, CommentView>();
    function count(comment: CommentView): number {
      commentsById.set(comment.id, comment);
      const descendants = comment.replies.reduce((sum, child) => sum + 1 + count(child), 0);
      counts.set(comment.id, descendants);
      return descendants;
    }
    renderedComments?.forEach(count);
    return { counts, commentsById };
  }, [renderedComments]);
  const replyTarget = typeof replyTo === "number" ? commentsById.get(replyTo) : undefined;
  const unavailableTarget = replyTo !== null && !replyTarget;
  const replyContext = replyTarget ? `Replying to ${replyTarget.authorName}`
    : replyTo === "reselect" ? "Choose a comment to address this draft to."
    : current ? "This comment is unavailable. Choose another comment or cancel to reply to the post."
    : "Loading the reply recipient…";

  function resumeAfterAuth() {
    if (unavailableTarget) return;
    // Guests can type into the first HTML before React receives input events.
    const body = inputRef.current?.value ?? draft;
    const mode = action.authStep === "enrol" ? "enrol" : undefined;
    if (!body.trim() && !replyTarget) { router.push(signInHref(destination, mode)); return; }
    try {
      router.push(beginDraftSignIn(window.localStorage, scope, destination,
        {body, parentId: replyTarget?.id, oneFix: oneFixRef.current?.checked === true}, mode));
    } catch { setNotice("This browser couldn’t save your reply. Copy it before signing in."); }
  }

  function setBranchOpen(id: number, open: boolean) {
    setCollapsed(previous => {
      if (previous.has(id) === !open) return previous;
      const next = new Set(previous);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const lastAnchor = useRef<number | null>(null);
  useEffect(() => {
    if (!active || linkedReply === null) {
      lastAnchor.current = null;
      return;
    }
    if (renderedComments && linkedReply !== lastAnchor.current && revealReply(sectionRef.current, linkedReply)) {
      lastAnchor.current = linkedReply;
    }
  }, [active, linkedReply, renderedComments]);

  const payload = {
    postId,
    body: draft.trim(),
    parentId: typeof replyTo === "number" ? replyTo : undefined,
    oneFix: !!allowOneFix && oneFix && replyTo === null,
    expectedAuthorId: viewerId ?? undefined,
  };
  const submissionKey = JSON.stringify(payload);
  const [attempted, setAttempted] = useState("");
  const reconsider = action.reconsider && attempted === submissionKey;
  async function submit(submitForReview = false) {
    if (unavailableTarget) return;
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
    else setNotice("Reply posted.");
    setRevision((r) => r + 1);
  }

  function showComment(c: CommentView, depth: number): React.ReactNode {
    const count = replyCounts.get(c.id) ?? 0;
    const replyLabel = count === 1 ? "1 reply" : `${count} replies`;
    return (
      <div key={c.id} className={threadStyles.replyBranch}>
        <div id={`reply-${c.id}`} className={`comment-row ${threadStyles.replyRow}`} tabIndex={-1}>
          <div className="comment-rail">
            <AvatarProfileLink userId={c.authorId} className={threadStyles.avatarLink}
              name={c.authorName} hue={c.authorHue} avatar={c.authorAvatar} size={32} />
            {c.replies.length > 0 && <span className="line" />}
          </div>
          <div className="comment-main">
            <div className={threadStyles.replyByline}>
              <Link href={`/u/${c.authorId}`} className="post-author">
                {c.authorName}
              </Link>{" "}
              {threadPage
                ? <a href={`#reply-${c.id}`} className={threadStyles.permalink} onClick={event => {
                    if (linkedReply === c.id && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                      revealReply(sectionRef.current, c.id);
                    }
                  }}><PermalinkTime iso={c.createdAt} context={`Link to reply by ${c.authorName}`} /></a>
                : <Link href={`/post/${postId}#reply-${c.id}`} className={threadStyles.permalink} prefetch={false}>
                    <PermalinkTime iso={c.createdAt} context={`Link to reply by ${c.authorName}`} />
                  </Link>}
            </div>
            <div className="post-body">
              {c.oneFix && <span className="onefix-tag">One fix</span>}
              {c.body}
            </div>
            {c.status === "held" && <span className="meta">Awaiting review</span>}
            <div className={threadStyles.replyActions}>
              {!repliesClosed && <button
                type="button"
                className="text-btn"
                aria-label={`Reply to ${c.authorName}`}
                disabled={action.busy}
                onClick={() => {
                  setBranchOpen(c.id, true);
                  setReplyTo(c.id);
                  setOneFix(false);
                  inputRef.current?.focus();
                }}
              >
                Reply
              </button>}
              <SaveReply replyId={c.id} postId={postId} signedIn={signedIn}/>
              {signedIn && viewerId === c.authorId ? <WithdrawSubmission kind="comment" id={c.id} onWithdraw={()=>setRevision(r=>r+1)}/> : <SafetyReport kind="comment" targetId={c.id}/>}
            </div>
          </div>
        </div>
        {count > 0 && <details className={threadStyles.replyGroup} open={!collapsed.has(c.id)}
          onToggle={event => {
            if (event.target === event.currentTarget) setBranchOpen(c.id, event.currentTarget.open);
          }}>
          <summary aria-label={`${replyLabel} under ${c.authorName}’s comment`}>{replyLabel}</summary>
          <div className={depth === 0 ? threadStyles.children : undefined}>
            {c.replies.map((child) => showComment(child, depth + 1))}
          </div>
        </details>}
      </div>
    );
  }

  return (
    <section ref={sectionRef} id={`replies-${postId}`} className="comments" aria-labelledby={`replies-title-${postId}`}>
      <h2 className={threadStyles.repliesTitle} id={`replies-title-${postId}`}>Replies</h2>
      {linkedReply !== null && renderedComments && !commentsById.has(linkedReply) && <p className="notice" role="status">This reply isn’t available. You can still read the visible replies below.</p>}
      {!current ? (
        <PostCardLoading label="Loading replies…" />
      ) : current.comments ? (
        current.comments.length ? (
          current.comments.map((c) => showComment(c, 0))
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
      {!repliesClosed && reconsider && (
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
            disabled={action.busy || unavailableTarget}
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
      {!repliesClosed && signedIn && action.authStep && <button type="button" className="text-btn" onClick={resumeAfterAuth}>
        {action.authStep === "enrol" ? "Confirm eligibility and return to reply" : "Sign in and return to reply"}
      </button>}
      {repliesClosed ? <p role="status" className="meta">The author closed new replies.</p> : <form className={threadStyles.replyForm}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {allowOneFix && replyTo === null && (
            <label className="meta">
              <input type="checkbox" ref={oneFixRef} checked={signedIn ? oneFix : undefined} onChange={(e) => setOneFix(e.target.checked)} /> Suggest one
              fix for the next game
            </label>
          )}
          {replyTo !== null && (
            <p className="meta">
              {replyContext}{" "}
              <button type="button" className="text-btn" disabled={action.busy} onClick={() => setReplyTo(null)}>
                Cancel
              </button>
            </p>
          )}
          {decisionQuestion && replyTo === null && (
            <details className={styles.replyGuide}>
              <summary>Help me frame my answer</summary>
              <p>What would you do? Why would it work here? When would you choose differently?</p>
              <p className="meta">For example, “I’d recall after crashing the wave so we can buy together. If it’s frozen at their tower, I’d ask my duo to help push first.”</p>
            </details>
          )}
          <div className="reply-composer">
            {signedIn && viewerIdentity && <Avatar {...viewerIdentity} size={32} />}
            {decisionQuestion ? (
              <textarea ref={setInputRef} className={styles.replyInput} aria-label="Your reply" rows={3}
                disabled={action.busy} placeholder="What would you try in this game?" value={signedIn ? draft : undefined}
                onChange={signedIn ? e => setDraft(e.target.value) : undefined} maxLength={1000} />
            ) : <input
              ref={setInputRef}
              disabled={action.busy}
              aria-label="Your reply"
              placeholder={oneFix ? "What would you change, and why?" : "Add your reply…"}
              value={signedIn ? draft : undefined}
              onChange={signedIn ? e => setDraft(e.target.value) : undefined}
              maxLength={1000}
            />}
            <button type="submit" className="btn small" disabled={action.busy || unavailableTarget || (signedIn ? !draft.trim() : !hydrated) || reconsider}>
              {action.busy ? "Sending…" : signedIn ? "Reply" : "Sign in to reply"}
            </button>
          </div>
          {!signedIn && <noscript><p className="meta">Copy your reply before signing in. Draft saving requires JavaScript. <a href={signInHref(destination)}>Sign in</a></p></noscript>}
        </form>}
    </section>
  );
}
