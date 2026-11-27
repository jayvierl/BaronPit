import Link from "next/link";
import type { MatchContext } from "@/lib/match-context";
import { returnToMatch } from "@/lib/decisions-input";
import { matchQueueName } from "@/lib/match-history";
import { PLATFORMS } from "@/lib/platforms";
import styles from "./match-discussion.module.css";

const riotTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function MatchDiscussionPreview({ match, fromMatch, postId, composing = false, reply = false }: {
  match: MatchContext; fromMatch?: string; postId?: number; composing?: boolean; reply?: boolean;
}) {
  const source = returnToMatch(fromMatch, match) ?? returnToMatch(match.matchHref, match);
  const url = source ? new URL(source, "https://match.invalid") : null;
  if (url && postId) url.searchParams.set("fromDiscussion", String(postId));
  const href = url && (url.pathname + url.search + url.hash);
  if (reply) return <div role="group" aria-label="Referenced match" className={styles.replyCard}>
    <span><strong>{match.champion}</strong> · {match.win ? "Victory" : "Defeat"} · {match.kills}/{match.deaths}/{match.assists}</span>
    {href && <Link href={href} prefetch={false}>View thread’s match</Link>}
  </div>;
  const title = composing ? "Public match preview" : "Public match";
  const region = PLATFORMS.find(platform => platform.id === match.region)?.label;
  const played = new Date(match.playedAt);
  const observed = new Date(match.sourceUpdatedAt);
  return <section className={styles.preview} aria-label={title}>
    <div>
      <div className={styles.byline}>
        <strong>{match.riotId} on {match.champion}</strong>
        <span className={match.win ? "win" : "loss"}>{match.win ? "Victory" : "Defeat"}</span>
      </div>
      <div className={styles.stats}>
        <span><span aria-hidden="true">{match.kills}/{match.deaths}/{match.assists}</span>
          <span className="sr-only">{match.kills} kills, {match.deaths} deaths, {match.assists} assists</span></span>
        <span>{match.cs} CS</span>
        <span>{matchQueueName(String(match.queueId))}</span>
        <span>{match.patch ? `Match patch ${match.patch}` : "Match patch unavailable"}</span>
      </div>
      <p className={styles.context}>
        {composing
          ? match.authorRole === "player" ? "Posting about a match on your verified Riot account." : "Sharing a public match. Your ownership of this Riot ID hasn’t been verified."
          : match.authorRole === "player" ? "Player verified at posting" : "Player ownership unverified"}
        {!composing && match.discussionKind === "perspective" && " · Perspective"}
        {" · Riot match data"}
      </p>
      {composing && <p className={styles.context}>The public card identifies {match.riotId} and keeps the match facts shown here after the game leaves recent history.</p>}
      <details className={styles.source}>
        <summary>Match source details</summary>
        <dl>
          <div><dt>Match region</dt><dd>{region ? `${region} (${match.region.toUpperCase()})` : match.region.toUpperCase()}</dd></div>
          <div><dt>Played</dt><dd><time dateTime={played.toISOString()}>{riotTime.format(played)} UTC</time></dd></div>
          <div><dt>Match snapshot as of</dt><dd><time dateTime={observed.toISOString()}>{riotTime.format(observed)} UTC</time></dd></div>
        </dl>
      </details>
    </div>
    {href && <Link className={styles.matchLink} href={href} prefetch={false}>View match</Link>}
  </section>;
}
