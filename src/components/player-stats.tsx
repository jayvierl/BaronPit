import Link from "next/link";
import { gameCount } from "@/lib/pure";
import { publicPlayerSummary } from "@/lib/player-summary";
import type { Player } from "@/lib/riot";
import styles from "./player-stats.module.css";

const integer = new Intl.NumberFormat("en-US");
const timestamp = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
});

export function PlayerStats({ player, source = "cache", lookupHref }: {
  player: Player;
  source?: "cache" | "live" | "stale";
  lookupHref?: string;
}) {
  const stats = publicPlayerSummary(player);
  return (
    <section className={styles.panel} aria-label="League stats">
      <header className={styles.header}>
        <h2>League stats</h2>
        {lookupHref && <Link href={lookupHref}>View match history <span aria-hidden="true">→</span></Link>}
      </header>
      <dl className={styles.ranked}>
        <div>
          <dt>Rank</dt>
          <dd className={styles.rank}>{stats.rank}</dd>
          {stats.rankStatus === "ranked" && <small>{stats.queue}</small>}
        </div>
        <div>
          <dt>Ranked games</dt>
          <dd>{stats.games === null ? "Unavailable" : integer.format(stats.games)}</dd>
          <small>This ranked year</small>
        </div>
        <div>
          <dt>Win rate</dt>
          <dd>{stats.winRate === null ? "—" : `${stats.winRate}%`}</dd>
          {stats.wins !== null && stats.losses !== null
            ? <small>{integer.format(stats.wins)}W · {integer.format(stats.losses)}L</small>
            : <small>Record unavailable</small>}
        </div>
      </dl>
      {stats.hasBothQueues && stats.rankedGames !== null && (
        <details className={styles.combined}>
          <summary>Other ranked stats</summary>
          <p>Across Solo/Duo and Flex this ranked year · <strong>{gameCount(stats.rankedGames)}</strong>
            {stats.rankedWinRate !== null && <> · <strong>{stats.rankedWinRate}%</strong> win rate</>}
            {stats.rankedWins !== null && stats.rankedLosses !== null && <> ({stats.rankedWins}W · {stats.rankedLosses}L)</>}
          </p>
        </details>
      )}
      {stats.sampleGames > 0 ? (
        <div className={styles.recent}>
          <h3>Last {gameCount(stats.sampleGames)} · all queues</h3>
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
      <p className={styles.note}>
        {source === "stale" ? "Riot couldn’t refresh this record. " : ""}
        {stats.asOf ? <>Riot snapshot · <time dateTime={stats.asOf}>{timestamp.format(new Date(stats.asOf))} UTC</time></> : "Snapshot date unavailable."}
      </p>
    </section>
  );
}
