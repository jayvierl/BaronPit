import Link from "next/link";
import { gameCount } from "@/lib/pure";
import { publicPlayerSummary } from "@/lib/player-summary";
import type { Player } from "@/lib/riot";
import { RankBadge } from "./rank-badge";
import styles from "./player-stats.module.css";

const integer = new Intl.NumberFormat("en-US");
const timestamp = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
});

export function PlayerStats({ player, source = "cache", lookupHref }: {
  player: Player;
  source?: "cache" | "live" | "stale" | "partial";
  lookupHref?: string;
}) {
  const stats = publicPlayerSummary(player);
  return (
    <section className={styles.panel} aria-label="League stats">
      <header className={styles.header}>
        <h2>League stats</h2>
        {lookupHref && <Link href={lookupHref}>View match history <span aria-hidden="true">→</span></Link>}
      </header>
      <p className={styles.note}>
        {source === "stale" ? "Riot couldn’t refresh this record. " : ""}
        {source === "partial" ? "Riot returned part of this profile. Some recent matches or queue records may be missing. " : ""}
        {stats.asOf ? <>
          {source === "stale" || !stats.snapshotFresh ? "Last known Riot records" : "Riot snapshot"}
          {" · "}<time dateTime={stats.asOf}>{timestamp.format(new Date(stats.asOf))} UTC</time>
        </> : "Snapshot date unavailable."}
      </p>
      <div className={styles.records}>
        {stats.rankedRecords.length ? stats.rankedRecords.map(({ queue, tier, rank, games, wins, losses, winRate }) => (
          <section className={styles.queue} key={queue} aria-label={queue}>
            <h3>{queue}</h3>
            <dl className={styles.ranked}>
              <div><dt>Rank</dt><dd><RankBadge tier={tier}>{rank}</RankBadge></dd></div>
              <div><dt>Ranked games</dt><dd>{games === null ? "Unavailable" : integer.format(games)}</dd></div>
              <div>
                <dt>Win rate</dt>
                <dd>{winRate === null ? "—" : `${winRate}%`}
                  {wins !== null && losses !== null
                    ? <small>{integer.format(wins)}W · {integer.format(losses)}L</small>
                    : <small>Record unavailable</small>}
                </dd>
              </div>
            </dl>
          </section>
        )) : (
          <p className={styles.rankEmpty}><RankBadge tier={stats.tier}>{stats.rank}</RankBadge> <small>Record unavailable</small></p>
        )}
      </div>
      {stats.hasBothQueues && stats.rankedGames !== null && (
        <details className={styles.combined}>
          <summary>Combined ranked record</summary>
          <p>Across Solo/Duo and Flex · <strong>{gameCount(stats.rankedGames)}</strong>
            {stats.rankedWinRate !== null && <> · <strong>{stats.rankedWinRate}%</strong> win rate</>}
            {stats.rankedWins !== null && stats.rankedLosses !== null && <> ({integer.format(stats.rankedWins)}W · {integer.format(stats.rankedLosses)}L)</>}
          </p>
        </details>
      )}
      {stats.sampleGames > 0 ? (
        <div className={styles.recent}>
          <h3>{source === "partial" ? `${gameCount(stats.sampleGames)} available` : `Last ${gameCount(stats.sampleGames)}`} · all queues</h3>
          <dl>
            <div>
              <dt>Most played role</dt>
              <dd>{stats.topRole ? <>{stats.topRole.name} <small>({gameCount(stats.topRole.games)}{stats.topRole.name.includes(" / ") ? " each" : ""})</small></> : "Role unavailable"}</dd>
            </div>
            <div>
              <dt>Most played champions</dt>
              <dd>{stats.champions.length ? <ul>{stats.champions.map(c =>
                <li key={c.name}>{c.name} <small>({gameCount(c.games)})</small></li>
              )}</ul> : "Champions unavailable"}</dd>
            </div>
          </dl>
        </div>
      ) : <p className={styles.note}>No recent games are available for a role or champion breakdown.</p>}
    </section>
  );
}
