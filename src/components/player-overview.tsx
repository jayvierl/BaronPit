import Link from "next/link";
import { RankBadge } from "@/components/rank-badge";
import { matchSectionId } from "@/lib/match-history";
import { publicPlayerSummary } from "@/lib/player-summary";
import { gameCount, type MatchSummary } from "@/lib/pure";
import type { Player } from "@/lib/riot";
import styles from "./player-overview.module.css";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const FORM_LENGTH = 6;

export function RecentResults({ matches, historyPath, partial = false }: { matches: MatchSummary[]; historyPath: string; partial?: boolean }) {
  const recent = matches.slice(0, FORM_LENGTH);
  if (!recent.length) return null;
  return (
    <section className={styles.form} aria-label="Recent form">
      <div>
        <p className={styles.label}>Recent form</p>
        <p className={styles.meta}>{partial ? `${gameCount(recent.length)} available` : `Last ${gameCount(recent.length)}`} · supported public queues</p>
      </div>
      <ol className={styles.results} aria-label="Newest games first">
        {recent.map((match, index) => {
          const id = matchSectionId(match.matchId);
          const result = match.win ? "W" : "L";
          const description = `${match.win ? "Victory" : "Defeat"} on ${match.champion}, game ${index + 1}`;
          return <li key={match.matchId}>
            {id ? <a href={`${historyPath}#${id}`} aria-label={`${result} · ${description}`} title={description} className={styles.result} data-result={result}>{result}</a>
              : <span className={styles.result} data-result={result}>{result}<span className="sr-only"> · {description}</span></span>}
          </li>;
        })}
      </ol>
    </section>
  );
}

export function PlayerOverview({ player, statsPath, historyPath }: { player: Player; statsPath: string; historyPath: string }) {
  const summary = publicPlayerSummary(player);
  const champion = summary.champions[0];
  const hasSample = summary.sampleGames > 0 && (summary.sampleRecord || summary.topRole || champion);
  const formLength = Math.min(player.snapshot.matches.length, FORM_LENGTH);
  return (
    <section className={styles.overview} aria-label="League overview">
      <div className={styles.heading}>
        <h2>League overview</h2>
        <Link prefetch={false} scroll={false} href={statsPath} className={styles.link}>View all player stats <span aria-hidden="true">→</span></Link>
      </div>
      <div className={styles.ranks}>
        {summary.rankedRecords.length > 0 ? summary.rankedRecords.map(record => (
          <div key={record.queue}>
            <p className={styles.meta}>{record.queue}</p>
            <div className={styles.rank}>
              <RankBadge tier={record.tier}>{record.rank}</RankBadge>
              {record.winRate !== null && <span className={styles.meta}>{record.winRate}% win rate</span>}
            </div>
            {record.wins !== null && record.losses !== null && <p className={styles.meta}>{record.wins}W · {record.losses}L</p>}
          </div>
        )) : <RankBadge>{summary.rank}</RankBadge>}
      </div>
      <p className={styles.meta}>
        {summary.asOf ? <>{summary.snapshotFresh ? "Riot snapshot · " : "Last known Riot snapshot · "}<time dateTime={summary.asOf}>{dateFormat.format(new Date(summary.asOf))}</time></>
          : "Snapshot date unavailable"}
      </p>
      <RecentResults matches={player.snapshot.matches} historyPath={historyPath} />
      {hasSample && (
        <div className={styles.sample}>
          {summary.sampleGames !== formLength && <p className={styles.meta}>Last {gameCount(summary.sampleGames)} · supported public queues</p>}
          <dl>
            {summary.sampleRecord && <div><dt>Recent win rate</dt><dd>{summary.sampleRecord.winRate}% <span className={styles.meta}>({summary.sampleRecord.wins}W · {summary.sampleRecord.losses}L)</span></dd></div>}
            {summary.topRole && <div><dt>Top role</dt><dd>{summary.topRole.name} · {gameCount(summary.topRole.games)}{summary.topRole.name.includes(" / ") ? " each" : ""}</dd></div>}
            {champion && <div><dt>Top champion</dt><dd>{champion.name} · {gameCount(champion.games)}</dd></div>}
          </dl>
        </div>
      )}
      <Link prefetch={false} href={player.snapshot.matches.length ? `${historyPath}#match-history` : historyPath} className={styles.link}>
        {player.snapshot.matches.length ? "View match history" : "Look up this Riot ID"} <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
