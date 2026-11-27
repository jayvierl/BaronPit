"use client";

import { signInHref } from "@/lib/signin-return";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PostView, CommentView } from "@/lib/social";
import type { AvatarIdentity } from "@/lib/author-identity";
import { REACTION_EMOJIS } from "@/lib/pure";
import { buildThreadReturn } from "@/lib/build-sharing";
import { clipLink } from "@/lib/clip-link";
import { projectMatchContext } from "@/lib/match-context";
import { PATCH_NOTES_INDEX, publicPatch } from "@/lib/patch-notes";
import { AvatarProfileLink, PermalinkTime, RichBody, timeAgo } from "./ui";
import { BuildAttachment } from "./build-attachment";
import { MatchCard } from "./match-card";
import { MatchDiscussionPreview } from "./match-discussion-preview";
import { PostLibraryActions } from "./discussion-library-actions";
import { RepostControl } from "./repost-control";
import { QuoteControl } from "./quote-control";
import { QuotePreview } from "./quote-preview";
import { WithdrawSubmission } from "./withdraw-submission";
import { CommentSection } from "./comment-section";
import { ActionFeedback, usePostAction } from "./post-action";
import { SafetyReport } from "./safety-report";
import { RankBadge } from "./rank-badge";
import { WinStreak } from "./win-streak";
import { ThreadIcon } from "./thread-icon";
import styles from "./thread.module.css";

const reactionNames: Record<string, string> = { "🔥": "Fire", "❤️": "Like", "👏": "Applause", "🎯": "On target", "💜": "Purple heart", GG: "Good game" };
const cutoffTime = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

function closeDisclosure(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape" || !event.currentTarget.open) return;
  event.currentTarget.open = false;
  event.currentTarget.querySelector("summary")?.focus();
}

export function PostCard({
  post,
  patch,
  signedIn,
  viewerId,
  threadPage = false,
  initialComments,
  viewerIdentity,
  fromMatch,
  fromBuild,
}: {
  post: PostView;
  patch: string;
  signedIn: boolean;
  viewerId?: number | null;
  threadPage?: boolean;
  initialComments?: CommentView[] | null;
  viewerIdentity?: AvatarIdentity | null;
  fromMatch?: string;
  fromBuild?: string;
}) {
  const router = useRouter();
  const threadHref = `/post/${post.id}`;
  const visible = post.status === "visible";
  const [withdrawn,setWithdrawn] = useState(false);
  const [reactions, setReactions] = useState(post.reactions);
  const [mine, setMine] = useState<string[]>(post.myReactions);
  const [inlineReplies, setInlineReplies] = useState(false);
  const showComments = visible && (threadPage || inlineReplies);
  const [replyVisit, setReplyVisit] = useState(threadPage ? 1 : 0);
  const reactionPicker = useRef<HTMLDetailsElement>(null);
  const [addedReplies, setAddedReplies] = useState(0);
  const action = usePostAction();
  const [myVote, setMyVote] = useState(post.myVote);
  const [pollResults, setPollResults] = useState(post.pollResults);
  const [elapsedCutoff, setElapsedCutoff] = useState<string | null>(null);
  const callCutoff = post.dailyCall?.closesAt;
  const callClosed = !!post.dailyCall && (post.dailyCall.closed || elapsedCutoff === callCutoff);
  useEffect(() => {
    if (!callCutoff || post.dailyCall?.closed) return;
    const timer = window.setTimeout(() => {
      setElapsedCutoff(callCutoff);
      router.refresh();
    }, Math.max(0, Date.parse(callCutoff) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [callCutoff, post.dailyCall?.closed, router]);

  const react = async (emoji: string) => {
    if (!signedIn) {
      router.push(signInHref(threadHref));
      return;
    }
    const active = !mine.includes(emoji);
    const result = await action.send("/api/social/react", { kind: "post", targetId: post.id, emoji, active });
    if (!result) return;
    const next = typeof result.active === "boolean" ? result.active : active;
    if (mine.includes(emoji) === next) return;
    setMine((current) => (next ? [...current, emoji] : current.filter((e) => e !== emoji)));
    setReactions((current) => ({ ...current, [emoji]: Math.max(0, (current[emoji] ?? 0) + (next ? 1 : -1)) }));
  };
  const vote = async (idx: number) => {
    if (!signedIn) {
      router.push(signInHref(threadHref));
      return;
    }
    if (callClosed || myVote === idx) return;
    if (!(await action.send("/api/social/vote", { postId: post.id, optionIdx: idx }))) {
      if (callCutoff) router.refresh();
      return;
    }
    setPollResults(
      (counts) => counts?.map((n, i) => Math.max(0, n + Number(i === idx) - Number(i === myVote))) ?? null,
    );
    setMyVote(idx);
  };

  const [rankLabel, main] = post.authorFlair?.split(" · ", 2) ?? [];
  const flair = rankLabel && <><RankBadge tier={post.authorTier}>{rankLabel}</RankBadge>{main && ` · ${main}`}</>;
  const d = post.data as Record<string, unknown>;
  const buildSource = post.kind === "build" ? buildThreadReturn(fromBuild, d.champion, d.items, post.roomSlug) : null;
  const matchContext = post.kind === "card" ? projectMatchContext(d.matchContext) : null;
  const destination = post.kind === "clip" && post.status === "visible" ? clipLink(d.url) : null;
  const likeCount = reactions["❤️"] ?? 0;
  const replyCount = post.commentCount + addedReplies;
  const otherReactionCount = REACTION_EMOJIS.reduce((n, emoji) => emoji === "❤️" ? n : n + (reactions[emoji] ?? 0), 0);
  const shownResults = post.dailyCall?.closed ? post.pollResults : pollResults;
  const pollTotal = shownResults?.reduce((a, b) => a + b, 0) ?? 0;

  if (withdrawn) return <p role="status">You withdrew this post. <a href="/me#submissions">View my submissions</a></p>;
  return (
    <article className={`thread-post ${styles.post}${threadPage ? ` ${styles.detailPost}` : ""}`} aria-label={`Post by ${post.authorName}`}>
      <div className="thread-rail">
        <AvatarProfileLink userId={post.authorId} className={styles.avatarLink}
          name={post.authorName} hue={post.authorHue} avatar={post.authorAvatar} size={44} mascot={post.dailyCallPayoffFor != null} />
        {showComments && <span className="line" aria-hidden="true" />}
      </div>
      <div className="thread-main">
        {post.repostedBy && <div className={styles.attribution}>
          <Link href={`/u/${post.repostedBy.id}`}>{post.repostedBy.name}</Link> reposted{" "}
          <Link href={threadHref} prefetch={false}>this {post.kind === "build" ? "build" : "discussion"}</Link>
        </div>}
        <header className={`thread-head ${styles.byline}`}>
          <div className={styles.bylineText}>
            <Link className="post-author" href={`/u/${post.authorId}`}>
              {post.authorName}
            </Link>
            <WinStreak wins={post.authorWinStreak}/>
            {post.roomName && post.roomSlug && <span className={styles.topic}>
              <span aria-hidden="true">›</span> <Link href={`/rooms/${post.roomSlug}`}>{post.roomName}</Link>
            </span>}
            {threadPage
              ? <span className={styles.permalink}><span aria-hidden="true">·</span> <time className="time" dateTime={post.createdAt} title={post.createdAt} suppressHydrationWarning>{timeAgo(post.createdAt)}</time></span>
              : <Link className={styles.permalink} href={threadHref} prefetch={false}>
                  <span aria-hidden="true">·</span> <PermalinkTime iso={post.createdAt} context={`Open thread by ${post.authorName}`} />
                </Link>}
          </div>
          <details className={styles.options} onKeyDown={closeDisclosure}>
            <summary aria-label="Post options" title="Post options"><ThreadIcon name="more" /></summary>
            <div className={styles.optionsPanel}>
              {visible && signedIn && viewerId === post.authorId &&
                <button type="button" className="text-btn" disabled={action.busy} onClick={async () => {
                  if (await action.send("/api/social/reply-policy", {postId:post.id, closed:!post.repliesClosed})) router.refresh();
                }}>{post.repliesClosed ? "Reopen replies" : "Close replies"}</button>}
              {signedIn && viewerId === post.authorId
                ? <WithdrawSubmission kind="post" id={post.id} onWithdraw={() => setWithdrawn(true)} />
                : <SafetyReport kind="post" targetId={post.id} />}
            </div>
          </details>
        </header>
        {(post.authorFlair || d.briefing === true || post.status === "held") && (
          <div className={styles.context}>
            {post.authorFlair && (post.authorStatsHref
              ? <Link href={post.authorStatsHref} prefetch={false} className={styles.flairLink}
                  aria-label={`View ${post.authorName}’s verified Riot stats, ${post.authorFlair}`}>{flair}</Link>
              : <span>{flair}</span>)}
            {d.briefing === true && <span>Automated patch update</span>}
            {post.status === "held" && <strong>Awaiting moderator review</strong>}
          </div>
        )}
        {post.body && <RichBody body={post.body} threadHref={threadPage ? undefined : threadHref} threadLinkClassName={styles.bodyLink}/>}
        {post.quote && <QuotePreview original={post.quote.original}/>}
        {post.dailyCallPayoffFor && <p className={styles.discussionLinks}>
          <Link href={`/post/${post.dailyCallPayoffFor}`} prefetch={false}>Read the original Daily Call</Link>
        </p>}
        {post.kind === "build" && <BuildAttachment post={post} patch={patch} canReconfirm={visible && viewerId === post.authorId}/>}

        {d.briefing === true && typeof d.notesUrl === "string" && (
          <p><a href={d.notesUrl} rel="noopener noreferrer" target="_blank">
            {d.notesUrl === PATCH_NOTES_INDEX ? "Browse Riot’s official patch notes" : `Read Riot’s patch ${publicPatch(d.patch)} notes`}
          </a></p>
        )}

        {post.kind === "poll" && Array.isArray(d.options) && (
          <div>
            {callCutoff ? <p className={styles.callStatus}><strong>Daily Call</strong>{" · "}{callClosed
              ? post.dailyCall?.finalized ? "Final tally" : "Voting closed. Tally pending."
              : <>Vote until <time dateTime={callCutoff}>{cutoffTime.format(new Date(callCutoff))}</time></>}</p>
              : d.call === true && <p className="chip badge">Make the Call</p>}
            {(d.options as string[]).map((opt, i) => {
              const n = shownResults?.[i] ?? 0;
              const pct = pollTotal ? Math.round((n / pollTotal) * 100) : 0;
              if (!visible) return <p key={i} className="meta">{opt}</p>;
              const outcome = <>
                <span className="poll-fill" style={{ width: `${pct}%` }} />
                <span>{opt}{myVote === i ? " ✓" : ""} — {n} vote{n === 1 ? "" : "s"} ({pct}%)</span>
              </>;
              if (callClosed) return <div key={i} className={`poll-option ${styles.closedOption}`}>{outcome}</div>;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={action.busy}
                  aria-pressed={myVote === i}
                  className="poll-option"
                  onClick={() => vote(i)}
                >
                  {outcome}
                </button>
              );
            })}
          </div>
        )}

        {post.kind === "card" && (matchContext ? <>
          <MatchDiscussionPreview match={matchContext} fromMatch={fromMatch} postId={post.id}/>
          {threadPage && viewerId !== post.authorId && <p className="meta">Use Post options → Report to flag a concern about this match card. <Link href="/safety">Safety Center</Link></p>}
        </> : <MatchCard data={d} patch={patch} itemPatch={post.itemPatch} itemDetails={post.itemDetails} />)}

        {destination && (
          <a className={styles.clip} href={destination.href} target="_blank" rel="noopener noreferrer nofollow ugc">
            <span className={styles.play} aria-hidden="true">▶</span>
            <span>Watch clip on {destination.hostname.replace(/^www\./, "")}</span>
            <span aria-hidden="true">↗</span>
          </a>
        )}
        {visible && !threadPage && (post.kind === "build" || matchContext || post.isQuestion || post.lastReplyId) && <div className={styles.discussionLinks}>
          {post.kind === "build" && <Link href={buildSource ? `${threadHref}?${new URLSearchParams({ fromBuild: buildSource.href })}` : threadHref}
            prefetch={false}>Discuss this build →</Link>}
          {matchContext && !post.isQuestion && <Link href={threadHref} prefetch={false}>View discussion →</Link>}
          {post.isQuestion && <Link href={threadHref} prefetch={false}>Discuss this decision →</Link>}
          {post.lastReplyId && post.lastReplyAt && <Link href={`${threadHref}#reply-${post.lastReplyId}`} prefetch={false}>Latest player reply{" "}
            <time dateTime={post.lastReplyAt} suppressHydrationWarning>{timeAgo(post.lastReplyAt)}</time>
          </Link>}
        </div>}
        {visible && <ActionFeedback error={action.error} />}
        {visible && <div className={styles.tools} role="group" aria-label="Post actions">
          <button type="button" className={`action-btn${mine.includes("❤️") ? " mine" : ""}`}
            aria-label={`Like, ${likeCount} ${likeCount === 1 ? "like" : "likes"}`} title="Like" aria-pressed={mine.includes("❤️")}
            disabled={action.busy} onClick={() => react("❤️")}>
            <ThreadIcon name="heart" filled={mine.includes("❤️")} />{likeCount > 0 && <span className={styles.count}>{likeCount}</span>}
          </button>
          {threadPage
            ? <a href={`#replies-${post.id}`} className="action-btn" title="Replies"
                aria-label={`Jump to replies, ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}>
                <ThreadIcon name="reply" />{replyCount > 0 && <span className={styles.count}>{replyCount}</span>}
              </a>
            : <button type="button" className="action-btn"
                onClick={() => { if (!inlineReplies) setReplyVisit(n => n + 1); setInlineReplies(open => !open); }}
                aria-expanded={showComments} aria-controls={`thread-replies-${post.id}`} title="Replies"
                aria-label={`${showComments ? "Hide" : "Show"} replies, ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}>
                <ThreadIcon name="reply" />{replyCount > 0 && <span className={styles.count}>{replyCount}</span>}
              </button>}
          <details className={styles.reactionPicker} ref={reactionPicker}
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
            }}
            onKeyDown={closeDisclosure}>
            <summary title="More reactions" aria-label={`More reactions, ${otherReactionCount} total`}>
              <ThreadIcon name="reactions" />{otherReactionCount > 0 && <span className={styles.count}>{otherReactionCount}</span>}
            </summary>
            <div className={styles.choices} role="group" aria-label="Choose a reaction">
              {REACTION_EMOJIS.filter(e => e !== "❤️").map(e => (
                <button key={e} type="button" className={`action-btn${mine.includes(e) ? " mine" : ""}`}
                  disabled={action.busy} aria-pressed={mine.includes(e)} title={reactionNames[e] ?? e}
                  aria-label={`${reactionNames[e] ?? e}, ${reactions[e] ?? 0} reactions`} onClick={() => {
                    if (reactionPicker.current) {
                      reactionPicker.current.open = false;
                      reactionPicker.current.querySelector("summary")?.focus();
                    }
                    void react(e);
                  }}>
                  <span aria-hidden="true">{e}</span>{reactions[e] || ""}
                </button>
              ))}
            </div>
          </details>
          {post.canRepost && <RepostControl key={String(post.myRepost)} postId={post.id} initial={post.myRepost === true} signedIn={signedIn}/>}
          {post.canQuote && <QuoteControl original={{ postId:post.id, author:post.authorName, body:post.body.slice(0,180), room:post.roomName }}
            signedIn={signedIn} viewerId={viewerId}/>}
          <PostLibraryActions postId={post.id} signedIn={signedIn}/>
        </div>}

      </div>
      {visible && <div id={`thread-replies-${post.id}`} className={styles.replyPanel} hidden={!showComments}>
          {replyVisit > 0 && <CommentSection
            key={viewerId ?? "guest"}
            active={showComments}
            visit={replyVisit}
            threadPage={threadPage}
            initialComments={initialComments}
            postId={post.id}
            signedIn={signedIn}
            viewerId={viewerId}
            viewerIdentity={viewerIdentity}
            onVisibleReply={() => setAddedReplies((n) => n + 1)}
            decisionQuestion={post.isQuestion}
            repliesClosed={post.repliesClosed}
            allowOneFix={post.kind === "card"}
          />}
      </div>}
    </article>
  );
}
