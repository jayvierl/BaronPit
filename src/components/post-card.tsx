"use client";

import { signInHref } from "@/lib/signin-return";
import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ItemIcons } from "./item-icons";
import { useRouter } from "next/navigation";
import type { PostView, CommentView } from "@/lib/social";
import type { AvatarIdentity } from "@/lib/author-identity";
import { REACTION_EMOJIS, samePatch } from "@/lib/pure";
import { clipLink } from "@/lib/clip-link";
import { PATCH_NOTES_INDEX, publicPatch } from "@/lib/patch-notes";
import { AvatarProfileLink, PermalinkTime, RichBody, timeAgo } from "./ui";
import { ChampionPortrait } from "./champion-portrait";
import { MatchCard } from "./match-card";
import { PostLibraryActions } from "./discussion-library-actions";
import { RepostControl } from "./repost-control";
import { WithdrawSubmission } from "./withdraw-submission";
import { CommentSection } from "./comment-section";
import { ActionFeedback, usePostAction } from "./post-action";
import { SafetyReport } from "./safety-report";
import { RankBadge } from "./rank-badge";
import { ThreadIcon } from "./thread-icon";
import styles from "./thread.module.css";

const reactionNames: Record<string, string> = { "🔥": "Fire", "❤️": "Like", "👏": "Applause", "🎯": "On target", "💜": "Purple heart", GG: "Good game" };

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
}: {
  post: PostView;
  patch: string;
  signedIn: boolean;
  viewerId?: number | null;
  threadPage?: boolean;
  initialComments?: CommentView[] | null;
  viewerIdentity?: AvatarIdentity | null;
}) {
  const router = useRouter();
  const [withdrawn,setWithdrawn] = useState(false);
  const [reactions, setReactions] = useState(post.reactions);
  const [mine, setMine] = useState<string[]>(post.myReactions);
  const [showComments, setShowComments] = useState(threadPage);
  const [replyVisit, setReplyVisit] = useState(threadPage ? 1 : 0);
  const reactionPicker = useRef<HTMLDetailsElement>(null);
  const [addedReplies, setAddedReplies] = useState(0);
  const action = usePostAction();
  const [myVote, setMyVote] = useState(post.myVote);
  const [pollResults, setPollResults] = useState(post.pollResults);
  const [buildPatch, setBuildPatch] = useState<string | null>(
    typeof post.data.patch === "string" ? post.data.patch : null,
  );

  const react = async (emoji: string) => {
    if (!signedIn) {
      router.push(signInHref(`/post/${post.id}`));
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
      router.push(signInHref(`/post/${post.id}`));
      return;
    }
    if (myVote === idx || !(await action.send("/api/social/vote", { postId: post.id, optionIdx: idx }))) return;
    setPollResults(
      (counts) => counts?.map((n, i) => Math.max(0, n + Number(i === idx) - Number(i === myVote))) ?? null,
    );
    setMyVote(idx);
  };

  const [rankLabel, main] = post.authorFlair?.split(" · ", 2) ?? [];
  const flair = rankLabel && <><RankBadge tier={post.authorTier}>{rankLabel}</RankBadge>{main && ` · ${main}`}</>;
  const d = post.data as Record<string, unknown>;
  const destination = post.kind === "clip" && post.status === "visible" ? clipLink(d.url) : null;
  const likeCount = reactions["❤️"] ?? 0;
  const replyCount = post.commentCount + addedReplies;
  const otherReactionCount = REACTION_EMOJIS.reduce((n, emoji) => emoji === "❤️" ? n : n + (reactions[emoji] ?? 0), 0);
  const pollTotal = pollResults?.reduce((a, b) => a + b, 0) ?? 0;

  if (withdrawn) return <p role="status">You withdrew this post. <a href="/me#submissions">View my submissions</a></p>;
  return (
    <article className={`thread-post ${styles.post}${threadPage ? ` ${styles.detailPost}` : ""}`} aria-label={`Post by ${post.authorName}`}>
      <div className="thread-rail">
        <AvatarProfileLink userId={post.authorId} className={styles.avatarLink}
          name={post.authorName} hue={post.authorHue} avatar={post.authorAvatar} size={44} />
        {showComments && <span className="line" aria-hidden="true" />}
      </div>
      <div className="thread-main">
        {post.repostedBy && <div className={styles.attribution}>
          <Link href={`/u/${post.repostedBy.id}`}>{post.repostedBy.name}</Link> reposted{" "}
          <a href={`/post/${post.id}`}>this {post.kind === "build" ? "build" : "discussion"}</a>
        </div>}
        <header className={`thread-head ${styles.byline}`}>
          <div className={styles.bylineText}>
            <Link className="post-author" href={`/u/${post.authorId}`}>
              {post.authorName}
            </Link>
            {post.roomName && post.roomSlug && <span className={styles.topic}>
              <span aria-hidden="true">›</span> <Link href={`/rooms/${post.roomSlug}`}>{post.roomName}</Link>
            </span>}
            <a className={styles.permalink} href={`/post/${post.id}`}>
              <span aria-hidden="true">·</span> <PermalinkTime iso={post.createdAt} context={`Open thread by ${post.authorName}`} />
            </a>
          </div>
          <details className={styles.options} onKeyDown={closeDisclosure}>
            <summary aria-label="Post options" title="Post options"><ThreadIcon name="more" /></summary>
            <div className={styles.optionsPanel}>
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
        {post.body && <RichBody body={post.body} />}
        {post.kind === "build" && (
          <div className={styles.buildAttachment}>
            <div className={styles.attachmentHeading}>
              {typeof d.champion === "string" && <ChampionPortrait compact id={d.champion} patch={patch} size={36}/>}
              <div>
                <strong>{String(d.champion ?? "")} build</strong>
                <div className="meta">
                  Patch {buildPatch ?? patch}
                  {d.offMeta ? (
                    <>
                      {" "}
                      · <span className="offmeta">OFF-META</span>
                    </>
                  ) : null}
                  {buildPatch && !samePatch(buildPatch, patch) && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="stale-tag">
                        Outdated — unconfirmed for patch {patch.split(".").slice(0, 2).join(".")}
                      </span>
                      {viewerId != null && viewerId === post.authorId && (
                        <button
                          type="button"
                          className={`text-btn ${styles.reconfirm}`}
                          disabled={action.busy}
                          onClick={async () => {
                            const result = await action.send("/api/social/builds/reconfirm", { postId: post.id });
                            if (typeof result?.patch === "string") setBuildPatch(result.patch);
                            if (result) router.refresh();
                          }}
                        >
                          Re-confirm for this patch
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <ItemIcons ids={Array.isArray(d.items) ? d.items : []} patch={post.itemPatch ?? patch} details={post.itemDetails}/>
            <a className="text-btn" href={`/builds/compare?build=${post.id}`}>Compare this build</a>
            {d.runes ? (
              <div className={styles.runes}>
                Runes: {String(d.runes)}
              </div>
            ) : null}
          </div>
        )}

        {d.briefing === true && typeof d.notesUrl === "string" && (
          <p><a href={d.notesUrl} rel="noopener noreferrer" target="_blank">
            {d.notesUrl === PATCH_NOTES_INDEX ? "Browse Riot’s official patch notes" : `Read Riot’s patch ${publicPatch(d.patch)} notes`}
          </a></p>
        )}

        {post.kind === "poll" && Array.isArray(d.options) && (
          <div>
            {d.call === true && <p className="chip badge">Make the Call</p>}
            {(d.options as string[]).map((opt, i) => {
              const n = pollResults?.[i] ?? 0;
              const pct = pollTotal ? Math.round((n / pollTotal) * 100) : 0;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={action.busy}
                  aria-pressed={myVote === i}
                  className="poll-option"
                  onClick={() => vote(i)}
                >
                  <span className="poll-fill" style={{ width: `${pct}%` }} />
                  <span>
                    {opt}
                    {myVote === i ? " ✓" : ""} — {n} vote{n === 1 ? "" : "s"} ({pct}%)
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {post.kind === "card" && <MatchCard data={d} patch={patch} itemPatch={post.itemPatch} itemDetails={post.itemDetails} />}

        {destination && (
          <a className={styles.clip} href={destination.href} target="_blank" rel="noopener noreferrer nofollow ugc">
            <span className={styles.play} aria-hidden="true">▶</span>
            <span>Watch clip on {destination.hostname.replace(/^www\./, "")}</span>
            <span aria-hidden="true">↗</span>
          </a>
        )}
        {(post.isQuestion && !threadPage || post.lastReplyAt) && <div className={styles.discussionLinks}>
          {post.isQuestion && !threadPage && <Link href={`/post/${post.id}`}>Discuss this decision →</Link>}
          {post.lastReplyAt && <Link href={`/post/${post.id}#replies-${post.id}`}>Latest player reply{" "}
            <time dateTime={post.lastReplyAt} suppressHydrationWarning>{timeAgo(post.lastReplyAt)}</time>
          </Link>}
        </div>}
        <ActionFeedback error={action.error} />
        <div className={styles.tools} role="group" aria-label="Post actions">
          <button type="button" className={`action-btn${mine.includes("❤️") ? " mine" : ""}`}
            aria-label={`Like, ${likeCount} ${likeCount === 1 ? "like" : "likes"}`} title="Like" aria-pressed={mine.includes("❤️")}
            disabled={action.busy} onClick={() => react("❤️")}>
            <ThreadIcon name="heart" filled={mine.includes("❤️")} />{likeCount > 0 && <span className={styles.count}>{likeCount}</span>}
          </button>
          <button type="button" className="action-btn"
            onClick={() => { if (!showComments) setReplyVisit(n => n + 1); setShowComments(!showComments); }}
            aria-expanded={showComments} aria-controls={`thread-replies-${post.id}`} title="Replies"
            aria-label={`${showComments ? "Hide" : "Show"} replies, ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}>
            <ThreadIcon name="reply" />{replyCount > 0 && <span className={styles.count}>{replyCount}</span>}
          </button>
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
          {post.status === "visible" && <PostLibraryActions postId={post.id} signedIn={signedIn}/>}
        </div>

      </div>
      <div id={`thread-replies-${post.id}`} className={styles.replyPanel} hidden={!showComments}>
          {replyVisit > 0 && <CommentSection
            key={viewerId ?? "guest"}
            active={showComments}
            visit={replyVisit}
            initialComments={initialComments}
            postId={post.id}
            signedIn={signedIn}
            viewerId={viewerId}
            viewerIdentity={viewerIdentity}
            onVisibleReply={() => setAddedReplies((n) => n + 1)}
            decisionQuestion={post.isQuestion}
            allowOneFix={post.kind === "card"}
          />}
      </div>
    </article>
  );
}
