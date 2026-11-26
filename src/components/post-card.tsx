"use client";

import { signInHref } from "@/lib/signin-return";
import { useState } from "react";
import { ItemIcons } from "./item-icons";
import { useRouter } from "next/navigation";
import type { PostView } from "@/lib/social";
import { REACTION_EMOJIS, samePatch } from "@/lib/pure";
import { clipLink } from "@/lib/clip-link";
import { PATCH_NOTES_INDEX, publicPatch } from "@/lib/patch-notes";
import { Avatar, RichBody, timeAgo } from "./ui";
import { ChampionPortrait } from "./champion-portrait";
import { MatchCard } from "./match-card";
import { PostLibraryActions } from "./discussion-library-actions";
import { CommentSection } from "./comment-section";
import { ActionFeedback, usePostAction } from "./post-action";
import { SafetyReport } from "./safety-report";

export function PostCard({
  post,
  patch,
  signedIn,
  viewerId,
  threadPage = false,
  viewerName,
  viewerHue,
}: {
  post: PostView;
  patch: string;
  signedIn: boolean;
  viewerId?: number | null;
  threadPage?: boolean;
  viewerName?: string;
  viewerHue?: number;
}) {
  const router = useRouter();
  const [reactions, setReactions] = useState(post.reactions);
  const [mine, setMine] = useState<string[]>(post.myReactions);
  const [showComments, setShowComments] = useState(threadPage);
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

  const d = post.data as Record<string, unknown>;
  const destination = post.kind === "clip" && post.status === "visible" ? clipLink(d.url) : null;
  const pollTotal = pollResults?.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <article className="thread-post">
      <div className="thread-rail">
        <a href={`/u/${post.authorId}`} aria-label={`${post.authorName}’s profile`}>
          <Avatar name={post.authorName} hue={post.authorHue} size={40} />
        </a>
        {showComments && <span className="line" />}
      </div>
      <div className="thread-main">
        <div className="thread-head">
          <a className="post-author" href={`/u/${post.authorId}`}>
            {post.authorName}
          </a>
          {post.authorFlair && <span className="flair" title="From the author’s verified Riot account">{post.authorFlair}</span>}
          <time className="time" dateTime={post.createdAt} suppressHydrationWarning>
            {timeAgo(post.createdAt)}
          </time>
          <SafetyReport kind="post" targetId={post.id} />
        </div>
        {(post.roomName || post.status === "held") && (
          <div className="meta">
            {post.roomName && (
              <>
                in <a href={`/rooms/${post.roomSlug}`}>{post.roomName}</a>
              </>
            )}
            {post.status === "held" && (
              <>
                {" "}
                · <strong>held for review</strong>
              </>
            )}
          </div>
        )}

        {post.lastReplyAt && <p className="meta"><a href={`/post/${post.id}`}>Latest player reply</a>{" "}
          <time dateTime={post.lastReplyAt} suppressHydrationWarning>{timeAgo(post.lastReplyAt)}</time>
        </p>}
        {post.isQuestion && !threadPage && <a className="text-btn" href={`/post/${post.id}`}>Discuss this decision →</a>}
        {post.kind === "build" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {typeof d.champion === "string" && <ChampionPortrait id={d.champion} patch={patch} size={36}/>}
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
                          className="text-btn"
                          style={{ marginLeft: 8, fontSize: 13 }}
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
              <div className="meta" style={{ color: "var(--ink-mid)" }}>
                Runes: {String(d.runes)}
              </div>
            ) : null}
          </div>
        )}

        {post.body && <RichBody body={post.body} />}
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
          <p>
            <a href={destination.href} target="_blank" rel="noopener noreferrer nofollow ugc">
              Watch clip on {destination.hostname.replace(/^www\./, "")} ↗
            </a>
          </p>
        )}
        <ActionFeedback error={action.error} />
        <div className="action-row">
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`action-btn${mine.includes(e) ? " mine" : ""}`}
              disabled={action.busy}
              aria-pressed={mine.includes(e)}
              onClick={() => react(e)}
              aria-label={`React ${e}`}
            >
              <span className="emoji">{e === "GG" ? null : e}</span>
              {e === "GG" && <span style={{ fontWeight: 700, fontSize: 13 }}>GG</span>}
              {(reactions[e] ?? 0) > 0 ? reactions[e] : ""}
            </button>
          ))}
          <button
            type="button"
            className="action-btn"
            onClick={() => setShowComments(!showComments)}
            aria-expanded={showComments}
            aria-label="Replies"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5Z" />
            </svg>
            {post.commentCount + addedReplies || ""}
          </button>
          {post.status === "visible" && <PostLibraryActions postId={post.id} signedIn={signedIn}/>}
          <a
            className="action-btn"
            href={`/post/${post.id}`}
            aria-label="Open post"
            style={{ marginLeft: "auto" }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3v13" />
              <path d="m7 10 5-5 5 5" />
              <path d="M4 21h16" />
            </svg>
          </a>
        </div>

        {showComments && (
          <CommentSection
            postId={post.id}
            signedIn={signedIn}
            viewerName={viewerName}
            viewerHue={viewerHue}
            onVisibleReply={() => setAddedReplies((n) => n + 1)}
            decisionQuestion={post.isQuestion}
            allowOneFix={post.kind === "card"}
          />
        )}
      </div>
    </article>
  );
}
