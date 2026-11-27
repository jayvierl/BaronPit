import Link from "next/link";
import { ChampionPortrait } from "@/components/champion-portrait";
import type { PlayerAnalytics } from "@/lib/player-analytics";
import { gameCount } from "@/lib/pure";
import styles from "./champion-summary.module.css";

const SUMMARY_COUNT = 5;

/** Short champion summary for the desktop side column beside match history.
 * The full sortable table lives in the Champions section below. */
export function ChampionSummary({ analytics, patch, partial, championsHref, className }: {
  analytics: PlayerAnalytics;
  patch: string;
  partial?: boolean;
  championsHref: string;
  className?: string;
}) {
  const champions = analytics.champions.slice(0, SUMMARY_COUNT);
  if (!champions.length) return null;
  return (
    <aside className={className ? `${styles.aside} ${className}` : styles.aside} aria-labelledby="champion-summary">
      <h2 id="champion-summary" className={styles.heading}>Champion summary</h2>
      <p className={styles.meta}>
        {partial ? `${gameCount(analytics.sampleGames, "public")} available` : `Latest ${gameCount(analytics.sampleGames, "public")}`}
      </p>
      <ul className={styles.list}>
        {champions.map(champion => (
          <li key={champion.id}>
            <ChampionPortrait compact id={champion.id} patch={patch} size={32} />
            <span className={styles.name}>
              <strong>{champion.name}</strong>
              <small>{gameCount(champion.games)} · {champion.wins}W–{champion.losses}L</small>
            </span>
            <span className={styles.record}>
              <strong>{champion.games ? `${Math.round(100 * champion.wins / champion.games)}%` : "—"}</strong>
              <small>{champion.kda.value !== null ? `${champion.kda.value.toFixed(2)} KDA` : "KDA —"}</small>
            </span>
          </li>
        ))}
      </ul>
      <Link prefetch={false} className={styles.more} href={championsHref}>
        Full champion stats <span aria-hidden="true">→</span>
      </Link>
    </aside>
  );
}
