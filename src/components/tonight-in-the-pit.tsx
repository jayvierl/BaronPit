import catalog from "@/lib/champion-catalog.json";
import type { tonightInThePit } from "@/lib/tonight-in-the-pit";
import styles from "./tonight-in-the-pit.module.css";

const number = new Intl.NumberFormat("en-US");
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const names = new Map(catalog.list.map(({id, name}) => [id, name]));

export function TonightInThePit({ summary, now }: {
  summary: Awaited<ReturnType<typeof tonightInThePit>> | null;
  now: number;
}) {
  return <section className={styles.tonight} aria-labelledby="tonight-in-the-pit-title">
    <h2 id="tonight-in-the-pit-title">Tonight in the pit</h2>
    {summary === null ? <p>Recent match activity is temporarily unavailable.</p> : !summary.isToday && summary.matches < 10 ?
      <p>Last 7 days · The summary appears once Riot lookups cover 10 distinct matches.</p> : <p>
        {summary.isToday ? `Today, ${date.format(now)} UTC` : `Last 7 days, ${date.format(summary.startsAt)}–${date.format(now)} UTC`}
        {" · "}{number.format(summary.matches)} {summary.matches === 1 ? "match" : "matches"} from Riot lookup snapshots
        {" · "}{number.format(summary.wins)}W–{number.format(summary.losses)}L across recorded player-games
        {summary.champion && <> · Most played {names.get(summary.champion.id) ?? summary.champion.id} ({number.format(summary.champion.appearances)} recorded, {summary.champion.winRate}% win rate)</>}
      </p>}
  </section>;
}
