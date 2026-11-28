import Link from "next/link";
import { matchRoleLabel } from "@/lib/match-history";
import { validRating } from "@/lib/match-performance";
import { reviewQuestion, reviewStandout, type ReviewQuestion } from "@/lib/match-review";
import type { MatchSummary } from "@/lib/pure";
import { CopyMatchLink } from "./copy-match-link";
import styles from "./match-review-card.module.css";

/** The reusable "review your last game" card: champion and result, the stored
 * rating when one exists, ONE standout stat taken from the stored record, and
 * one open decision question. It renders only what the match record holds —
 * an unrated game shows no score and an unstored stat shows nothing — and the
 * question invites a look without ever claiming why the game was won or lost.
 *
 * Actions reuse the surfaces that already exist: `discussHref` is the exact
 * "Discuss this match" link (its fromMatch return preserves the visitor's
 * player + match context through sign-in), and `sharePath` is the exact
 * public match URL the copy button shares. */
export function MatchReviewCard({
  match,
  eyebrow,
  question,
  discussHref,
  discussLabel = "Discuss this match",
  sharePath,
  shareLabel,
  viewHref,
  viewLabel,
  id,
}: {
  match: MatchSummary;
  eyebrow?: string;
  question?: ReviewQuestion;
  discussHref?: string;
  discussLabel?: string;
  sharePath?: string;
  shareLabel?: string;
  viewHref?: string;
  viewLabel?: string;
  id?: string;
}) {
  const standout = reviewStandout(match);
  const asked = question ?? reviewQuestion(match);
  const role = match.role ? matchRoleLabel(match.role) : "";
  const rating = validRating(match.performanceRating) ? match.performanceRating : undefined;
  return (
    <section className={styles.card} aria-label={`Match review: ${match.champion}`} id={id}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h3 className={styles.champion}>{match.champion}{role && <> · {role}</>}</h3>
      <p className={styles.resultLine}>
        <span className={styles.pill} data-win={match.win || undefined}>{match.win ? "Victory" : "Defeat"}</span>
        <span>{match.kills} / {match.deaths} / {match.assists} K/D/A</span>
        {rating !== undefined && <span>· {rating.toFixed(1)}/10 rating</span>}
      </p>
      {standout && (
        <p className={styles.standout}>
          <strong>{standout.value}</strong>
          <span>{standout.label}</span>
        </p>
      )}
      <div className={styles.question}>
        <p className={styles.questionLead}>{asked.lead}</p>
        <p className={styles.questionOptions}>{asked.options}</p>
      </div>
      {(discussHref || sharePath || viewHref) && (
        <div className={styles.actions}>
          {discussHref && <Link className={styles.primary} href={discussHref} prefetch={false}>{discussLabel}</Link>}
          {sharePath && <CopyMatchLink path={sharePath} className={styles.secondary} label={shareLabel} />}
          {viewHref && <Link className={styles.view} href={viewHref} prefetch={false}>{viewLabel ?? "View the match"} ↗</Link>}
        </div>
      )}
    </section>
  );
}
