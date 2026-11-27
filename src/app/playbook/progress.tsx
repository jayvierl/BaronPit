import Link from "next/link";
import { DECISION_FOLLOW_UP, trialOutcomes } from "@/lib/decisions-input";
import { type myDecisionProgress } from "@/lib/decisions";
import styles from "./progress.module.css";

export function progressPath(ready: boolean, before?: number | null) {
  const params = new URLSearchParams({ tab: "progress" });
  if (ready) params.set("stage", "ready");
  if (before) params.set("before", String(before));
  return `/playbook?${params}`;
}

export function MyProgress({ page, before, ready, canParticipate }: {
  page: Awaited<ReturnType<typeof myDecisionProgress>> | null;
  before: number | null;
  ready: boolean;
  canParticipate: boolean;
}) {
  return <div>
    <p className="meta">Choose a helpful reply on one of your questions, try its advice, then share how it went whenever you’re ready.</p>
    <nav className={styles.links} aria-label="Progress views">
      <Link href={progressPath(false)} aria-current={ready ? undefined : "page"} prefetch={false}>All questions</Link>
      <Link href={progressPath(true)} aria-current={ready ? "page" : undefined} prefetch={false}>Ready to try</Link>
    </nav>
    {page === null ? <p role="alert">Your progress couldn’t load. <Link href={progressPath(ready,before)}>Try again</Link>.</p>
      : page.entries.length === 0 ? <div className="empty">
          <p>{before ? "You’ve reached the end." : ready ? "No questions are ready to try yet." : "Your published match questions and follow-ups appear here."}</p>
          {!before && (ready ? <Link href={progressPath(false)}>See all your questions</Link>
            : canParticipate && <Link href="/questions/new">Ask a match question</Link>)}
        </div>
      : page.entries.map(({postId,body,champion,topic,answer,outcome}) => (
        <article key={postId} className={styles.entry}>
          <p className="meta">
            {champion} · {topic} · {outcome ? trialOutcomes[outcome] : answer ? "Ready to try" : "No helpful answer selected"}
          </p>
          <h2>{body.length > 180 ? body.slice(0,180) + "…" : body}</h2>
          {answer && <p>Advice from {answer.name} · {answer.body.length > 140 ? answer.body.slice(0,140) + "…" : answer.body}</p>}
          <Link prefetch={false} href={`/post/${postId}#${DECISION_FOLLOW_UP}`}>
            {canParticipate && answer ? outcome ? "Review follow-up" : "Log what happened" : "Return to question"}
          </Link>
        </article>
      ))}
    {(before || page?.next) && <nav className={styles.links} aria-label="Progress pages">
      {before && <Link prefetch={false} href={progressPath(ready)}>Back to latest questions</Link>}
      {page?.next && <Link prefetch={false} href={progressPath(ready,page.next)}>Older questions</Link>}
    </nav>}
  </div>;
}
