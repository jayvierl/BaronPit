import Link from "next/link";
import { dbAvailable } from "@/lib/db";
import { featuredMatchup, reviewHosts, type FeaturedMatchup } from "@/lib/community-review";
import { reviewHour, reviewHostStatus } from "@/lib/review-hour-time";
import { LocalReviewTime } from "./review-hour-controls";
import { SafetyReport } from "./safety-report";
import { ShareDiscussion } from "./discussion-library-actions";
import styles from "./community-review.module.css";

function excerpt(text: string, limit: number) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return (cut.replace(/\s+\S*$/, "") || cut).trimEnd() + "…";
}

function Featured({ match }: { match: FeaturedMatchup }) {
  return (
    <section aria-label="Matchup of the week">
      <h2>Matchup of the week</h2>
      <p className="meta">
        {match.champion} vs {match.opponent}
        {match.patch && ` · Patch ${match.patch}`}
      </p>
      <h3 className={styles.question}>
        <Link href={`/post/${match.postId}?from=weekly-matchup`}>{excerpt(match.question, 190)}</Link>
      </h3>
      <div className={styles.credits}>
        Asked by <Link href={`/u/${match.asker.id}`}>{match.asker.name}</Link>
        <SafetyReport kind="post" targetId={match.postId} />
      </div>
      <blockquote className={styles.answer}>{excerpt(match.answer, 280)}</blockquote>
      <div className={styles.credits}>
        Selected answer from <Link href={`/u/${match.helper.id}`}>{match.helper.name}</Link>
        {match.helper.host && <span className="meta">Session host</span>}
        <SafetyReport kind="comment" targetId={match.commentId} />
      </div>
      {match.outcome && <p>Asker’s follow-up · {match.outcome}</p>}
      <div className={styles.links}>
        <Link href={`/post/${match.postId}?from=weekly-matchup`}>Read the discussion</Link>
        <ShareDiscussion postId={match.postId} />
      </div>
    </section>
  );
}

export async function CommunityReview({ viewerId }: { viewerId: number | null }) {
  const session = reviewHour();
  const [match, hosts] = dbAvailable() ? await Promise.all([
    featuredMatchup(viewerId).catch(() => null),
    reviewHosts(session.start, viewerId).catch(() => null),
  ]) : [null, null];
  return (
    <aside className={styles.panel} aria-label="Community review">
      {match && <Featured match={match} />}
      <section aria-label="Bot lane review hour" style={match ? { marginTop: "1.25rem" } : undefined}>
        <h2>
          <Link href="/review-hour">Bot lane review hour</Link>
        </h2>
        <p>
          {session.live ? "Scheduled hour underway" : "Next session"} ·{" "}
          <LocalReviewTime start={session.start} end={session.end} />
        </p>
        <p className="meta">{reviewHostStatus(hosts)}</p>
        <div className={styles.links}>
          <Link href="/review-hour">See the session and questions</Link>
        </div>
      </section>
    </aside>
  );
}
