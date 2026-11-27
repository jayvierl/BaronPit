import catalog from "@/lib/champion-catalog.json";
import { playerDisplayTime } from "@/lib/player-display-time";
import type { Player } from "@/lib/riot";
import { ChampionPortrait } from "./champion-portrait";
import styles from "./player-mastery.module.css";

const bundled = new Map(catalog.list.map(champion => [champion.key, champion]));
const integer = new Intl.NumberFormat("en-US");

export function masteryNeedsCatalog(mastery: Player["championMastery"]) {
  return mastery?.champions.some(champion => !bundled.has(champion.championId)) ?? false;
}

export function PlayerMastery({ mastery, patch, champions = [] }: {
  mastery: Player["championMastery"];
  patch: string;
  champions?: readonly { id: string; name: string; key?: number }[];
}) {
  const recordedAt = playerDisplayTime(mastery?.fetchedAt);
  const leaders = mastery?.champions.slice(0, 8) ?? [];
  const current = new Map(champions.map(champion => [champion.key, champion]));

  return (
    <section id="mastery" className={styles.panel} aria-labelledby="player-mastery-title">
      <h2 id="player-mastery-title">Champion mastery</h2>
      {recordedAt && <p className={styles.caption}>Riot mastery as of <time dateTime={recordedAt.dateTime}>{recordedAt.label}</time></p>}
      {!mastery ? <p className={styles.caption}>Mastery is unavailable. Use Update to try again.</p> : leaders.length === 0 ? (
        <p className={styles.caption}>Riot has no mastery entries for this player.</p>
      ) : <ol className={styles.leaders} role="list">
        {leaders.map(({ championId, level, points }) => {
          const champion = current.get(championId) ?? bundled.get(championId);
          return <li key={championId} className={styles.leader}>
            {champion && <ChampionPortrait id={champion.id} patch={patch} size={36} compact />}
            <div>
              <strong>{champion?.name ?? `Champion ${championId}`}</strong>
              <span className={styles.points}>{integer.format(points)} points</span>
            </div>
            <span className={styles.level}>Level {integer.format(level)}</span>
          </li>;
        })}
      </ol>}
    </section>
  );
}
