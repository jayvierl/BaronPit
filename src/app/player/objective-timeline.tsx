import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import type { MatchReference } from "@/lib/match-context";
import { readObjectiveTimeline } from "@/lib/objective-timeline";
import styles from "./history.module.css";

const unavailable = {
  restricted: "This match needs a recent, public player record to open its timeline.",
  missing: "Riot has no timeline available for this match.",
  limited: "Timeline requests are temporarily limited. Try again later.",
  unavailable: "The objective timeline is temporarily unavailable.",
};

export async function ObjectiveTimeline({ reference, returnHref }: { reference: MatchReference; returnHref: string }) {
  const user = await getCurrentUser();
  const result = await readObjectiveTimeline(reference, user?.id ?? null);
  return <section className={styles.timeline} aria-label="Objective timeline">
    <h4>Objective timeline</h4>
    {result.status !== "available" ? <p role="status">{unavailable[result.status]}</p> : <>
      <small>Riot match timeline · Retrieved <time dateTime={result.observedAt}>{new Date(result.observedAt).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} UTC</time></small>
      {result.events.length ? <ol>{result.events.map((event, index) => <li key={index}>
        <span>{Math.floor(event.seconds / 60)}:{String(event.seconds % 60).padStart(2, "0")}</span>
        <strong>{event.objective}</strong>{event.side && <small>{event.side} team</small>}
      </li>)}</ol> : <p>Riot recorded no supported monster or structure events in this timeline.</p>}
    </>}
    <Link href={returnHref} className={styles.timelineLink} prefetch={false}>Back to match</Link>
  </section>;
}
