import Link from "next/link";
import { type profileMatchDiscussions } from "@/lib/decisions";
import { matchQueueName } from "@/lib/match-history";
import { withSearchReturn } from "@/lib/search-scopes";
import styles from "./profile.module.css";

export function ProfileMatchDiscussions({ page, older, latestHref, olderHref, searchReturn, isSelf }: {
  page: Awaited<ReturnType<typeof profileMatchDiscussions>> | null;
  older: boolean;
  latestHref: string;
  olderHref?: string;
  searchReturn?: string;
  isSelf: boolean;
}) {
  return <section aria-labelledby="match-discussions">
    <h2 className={styles.discussionsHeading} id="match-discussions">Match discussions</h2>
    {page === null ? <p role="status">Match discussions couldn’t load. <Link href={latestHref}>Try again</Link>.</p>
      : page.entries.length === 0 ? <div className={styles.empty}>
          <p>{older ? "You’ve reached the end." : "No published match discussions yet."}</p>
          {!older && <Link href={isSelf ? "/player" : "/questions"}>{isSelf ? "Find a match to discuss" : "Browse match questions"}</Link>}
        </div>
      : page.entries.map(({ postId, body, matchContext: match, topic }) => <article className={styles.reply} key={postId}>
        <p className="meta">
          {match.discussionKind === "perspective" ? "Perspective" : "Match question"}
          {" · "}{match.champion} · {matchQueueName(String(match.queueId))} · {topic}
        </p>
        <p className={styles.discussionExcerpt}>{body.length > 180 ? body.slice(0, 180) + "…" : body}</p>
        <div className={styles.replyActions}>
          <Link href={`/post/${postId}`}>Open thread</Link>
          <Link prefetch={false} href={withSearchReturn(match.matchHref, searchReturn)}>View match</Link>
        </div>
      </article>)}
    {(older || olderHref) && <nav className={styles.replyPages} aria-label="Match discussion pages">
      {older && <Link prefetch={false} href={latestHref}>Back to latest discussions</Link>}
      {olderHref && <Link prefetch={false} href={olderHref}>Older discussions</Link>}
    </nav>}
  </section>;
}
