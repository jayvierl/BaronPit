import Link from "next/link";
import { ChampionPortrait } from "@/components/champion-portrait";
import { gameCount } from "@/lib/pure";
import type { GameRecord, Metric, PlayerAnalytics } from "@/lib/player-analytics";
import styles from "./player-analytics.module.css";

type Props = { analytics: PlayerAnalytics; partial?: boolean };
const dates = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function SampleScope({ analytics, partial }: Props) {
  return <p className={styles.meta}>
    {analytics.sampleGames ? (
      partial ? `${gameCount(analytics.sampleGames, "public")} available` : `Latest ${gameCount(analytics.sampleGames, "public")}`
    ) : "No recent public games are available."}
    {partial && " The available history may have gaps."}
  </p>;
}

function ShareBars({ rows, total }: { rows: PlayerAnalytics["roles"]; total: number }) {
  return <ul className={styles.bars}>
    {rows.map(({ name, count }) => {
      const share = Math.round(count * 100 / total);
      return <li key={name}>
        <span>{name}</span>
        <span className={styles.track} aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
        <strong>{share}%</strong>
      </li>;
    })}
  </ul>;
}

export function PlayerPlayStyle({ analytics, partial }: Props) {
  return <section className={styles.panel} aria-labelledby="player-play-style">
    <h2 id="player-play-style">Play style</h2>
    <SampleScope analytics={analytics} partial={partial} />
    {analytics.sampleGames > 0 && <>
      <h3>Role share</h3>
      {analytics.knownRoles > 0 ? <>
        <p className={styles.meta}>Riot recorded a role in {analytics.knownRoles} of {gameCount(analytics.sampleGames)}.</p>
        <ShareBars rows={analytics.roles} total={analytics.knownRoles} />
      </> : <p className={styles.meta}>Riot did not record a role for these queues.</p>}
      <h3>Preferred classes</h3>
      {analytics.knownClasses > 0 ? <>
        <p className={styles.meta}>Class tags available in {analytics.knownClasses} of {gameCount(analytics.sampleGames)}. Each game is split evenly across the champion’s Data Dragon classes.</p>
        <ShareBars rows={analytics.classes} total={analytics.knownClasses} />
      </> : <p className={styles.meta}>Class tags are unavailable for these champions.</p>}
    </>}
  </section>;
}

function gameLength(seconds: number) {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return minutes ? `${minutes}m ${String(rounded % 60).padStart(2, "0")}s` : `${rounded}s`;
}

const metricRows = [
  { key: "winRate", name: "Win rate", kind: "percent" },
  { key: "kda", name: "KDA", kind: "decimal" },
  { key: "killParticipation", name: "Kill participation", kind: "percent" },
  { key: "gameLength", name: "Game length", kind: "time" },
] as const;

function metricText(metric: Metric, kind: (typeof metricRows)[number]["kind"]) {
  if (metric.value === null) return kind === "decimal" && metric.count ? "0 deaths" : "—";
  if (kind === "percent") return `${metric.value.toFixed(1)}%`;
  if (kind === "time") return gameLength(metric.value);
  return metric.value.toFixed(2);
}

function difference(latest: Metric, earlier: Metric, kind: (typeof metricRows)[number]["kind"]) {
  if (latest.value === null || earlier.value === null) return "—";
  const value = latest.value - earlier.value;
  const magnitude = Math.abs(value);
  const display = kind === "percent" ? magnitude.toFixed(1) : kind === "decimal" ? magnitude.toFixed(2) : String(Math.round(magnitude));
  const prefix = Number(display) === 0 ? "" : value < 0 ? "−" : "+";
  return prefix + (kind === "time" ? gameLength(magnitude) : kind === "percent" ? `${display} pp` : display);
}

export function PlayerPerformance({ analytics, partial }: Props) {
  const { latest, earlier } = analytics.performance;
  return <section className={styles.panel} aria-labelledby="player-performance">
    <h2 id="player-performance">Recent performance</h2>
    <SampleScope analytics={analytics} partial={partial} />
    {latest.games > 0 && <>
      {earlier.games === 0 && <p className={styles.meta}>Earlier games are needed to calculate a comparison.</p>}
      <table className={styles.metrics} aria-label="Performance by match sample">
        <thead><tr>
          <th scope="col">Metric</th>
          <th scope="col">Latest {gameCount(latest.games)}</th>
          {earlier.games > 0 && <><th scope="col">Previous {gameCount(earlier.games)}</th><th scope="col">Change</th></>}
        </tr></thead>
        <tbody>{metricRows.map(({ key, name, kind }) => <tr key={key}>
          <th scope="row">{name}</th>
          <td>{metricText(latest[key], kind)}{latest[key].count < latest.games && <small>{gameCount(latest[key].count)} measured</small>}</td>
          {earlier.games > 0 && <>
            <td>{metricText(earlier[key], kind)}{earlier[key].count < earlier.games && <small>{gameCount(earlier[key].count)} measured</small>}</td>
            <td>{difference(latest[key], earlier[key], kind)}</td>
          </>}
        </tr>)}</tbody>
      </table>
      <p className={styles.meta}>KDA uses total kills and assists divided by deaths. Kill participation and game length are averages over matches with those records. Changes in rates are percentage points (pp).</p>
    </>}
  </section>;
}

function recordRate(record: GameRecord) {
  return record.games ? `${Math.round(100 * record.wins / record.games)}%` : "—";
}

function RecordBar({ record, max }: { record: GameRecord; max: number }) {
  const width = max > 0 ? 100 / max : 0;
  return <span className={`${styles.track} ${styles.recordBar}`} aria-hidden="true">
    <i style={{ width: `${record.wins * width}%` }} /><i style={{ width: `${record.losses * width}%` }} />
  </span>;
}

function ActivityBars({ bins }: { bins: readonly (GameRecord & { name: string })[] }) {
  const max = Math.max(0, ...bins.map(bin => bin.games));
  return <ul className={`${styles.bars} ${styles.activityBars}`}>
    {bins.map(bin => <li key={bin.name}>
      <span>{bin.name}</span>
      <RecordBar record={bin} max={max} />
      <span className={styles.numbers}>{bin.games ? `${gameCount(bin.games)} · ${bin.wins}W · ${recordRate(bin)} WR` : "0 games"}</span>
    </li>)}
  </ul>;
}

function hourLabel(hour: number) {
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

export function PlayerActivity({ analytics, partial }: Props) {
  const { days, hours, knownTimes } = analytics.activity;
  const max = Math.max(1, ...hours.map(hour => hour.games));
  return <section className={styles.panel} aria-labelledby="player-activity-patterns">
    <h2 id="player-activity-patterns">Activity patterns</h2>
    <SampleScope analytics={analytics} partial={partial} />
    {knownTimes > 0 ? <>
      <p className={styles.meta}>Match end times in UTC · {knownTimes} of {gameCount(analytics.sampleGames)} dated. A stronger tint marks more games.</p>
      <h3>Time of day</h3>
      <div className={styles.hourGrid} aria-hidden="true">
        <span />{hours.slice(0,12).map(({hour}) => <small key={hour} className={styles.tick}>{hour % 3 === 0 ? hour || 12 : ""}</small>)}
        <strong>AM</strong>{hours.slice(0,12).map(({hour,games}) => <span key={hour} className={styles.hour} data-active={games > 0} style={{ opacity: games ? .3 + .7 * games / max : 1 }} />)}
        <strong>PM</strong>{hours.slice(12).map(({hour,games}) => <span key={hour} className={styles.hour} data-active={games > 0} style={{ opacity: games ? .3 + .7 * games / max : 1 }} />)}
      </div>
      <details className={styles.disclosure}>
        <summary>Hour-by-hour results (UTC)</summary>
        <ActivityBars bins={hours.map(hour => ({ ...hour, name: hourLabel(hour.hour) }))} />
      </details>
      <h3>Day of week</h3>
      <ActivityBars bins={days} />
    </> : analytics.sampleGames > 0 && <p className={styles.meta}>Match timestamps are unavailable in this sample.</p>}
  </section>;
}

const CHAMPIONS_SHOWN = 8;
type ChampionRecord = PlayerAnalytics["champions"][number];

export type ChampionSortKey = "games" | "winrate" | "kda" | "cs" | "rating" | "damage";
export type ChampionSort = { key: ChampionSortKey; dir: "asc" | "desc"; base: string };

const championSortColumns: { key: ChampionSortKey; label: string; value: (c: ChampionRecord) => number | null }[] = [
  { key: "games", label: "Games", value: c => c.games },
  { key: "winrate", label: "Win rate", value: c => c.games ? c.wins / c.games : null },
  { key: "kda", label: "KDA", value: c => c.kda.value },
  { key: "cs", label: "CS/min", value: c => c.csPerMinute.value },
  { key: "rating", label: "Avg rating", value: c => c.rating.value },
  { key: "damage", label: "Team dmg", value: c => c.damageShare.value },
];

function sortedChampions(champions: readonly ChampionRecord[], sort?: ChampionSort): ChampionRecord[] {
  const column = championSortColumns.find(entry => entry.key === sort?.key) ?? championSortColumns[0];
  const dir = sort?.dir === "asc" ? 1 : -1;
  return [...champions].sort((a, b) => {
    const av = column.value(a), bv = column.value(b);
    if (av !== bv) {
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    }
    return b.games - a.games || a.name.localeCompare(b.name);
  });
}

function RatingSparkline({ values, champion }: { values: readonly number[]; champion: string }) {
  if (values.length < 2) return null;
  const width = 96, height = 28, gutter = 3;
  const x = (i: number) => gutter + ((width - 2 * gutter) * i) / (values.length - 1);
  const y = (value: number) => height - gutter - ((height - 2 * gutter) * (value - 1)) / 9;
  const line = values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  return <svg role="img" aria-label={`Match ratings on ${champion} across the last ${values.length} rated games, oldest to newest`}
    viewBox={`0 0 ${width} ${height}`} className={styles.spark}>
    <polyline points={line} className={styles.sparkLine} />
  </svg>;
}

function ChampionTable({ champions, patch, visibleRooms, sort }: {
  champions: readonly ChampionRecord[]; patch: string; visibleRooms?: ReadonlySet<string>; sort?: ChampionSort;
}) {
  const sortHref = (key: ChampionSortKey) => {
    const url = new URL(sort!.base, "https://profile.invalid");
    url.searchParams.set("csort", key);
    url.searchParams.set("cdir", sort!.key === key && sort!.dir === "desc" ? "asc" : "desc");
    url.hash = "player-champions";
    return url.pathname + url.search + url.hash;
  };
  return <div className={styles.tableWrap}>
    <table className={styles.champTable} aria-label="Champion records in this sample">
      <thead><tr>
        <th scope="col">Champion</th>
        {championSortColumns.map(column => {
          const active = (sort?.key ?? "games") === column.key;
          return <th key={column.key} scope="col" className={styles.num}
            aria-sort={sort && active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
            {sort ? <Link prefetch={false} href={sortHref(column.key)} aria-current={active || undefined}>
              {column.label}{active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
            </Link> : column.label}
          </th>;
        })}
      </tr></thead>
      <tbody>{sortedChampions(champions, sort).map(champion => {
        const slug = `champ-${champion.id.toLowerCase()}`;
        const hasRoom = visibleRooms?.has(slug) ?? false;
        const kda = metricText(champion.kda, "decimal");
        return <tr key={champion.id}>
          <th scope="row">
            <span className={styles.champCell}>
              <ChampionPortrait compact id={champion.id} patch={patch} size={32} />
              <span>
                <strong>{champion.name}</strong>
                <Link prefetch={false} className={styles.more} href={hasRoom ? `/rooms/${slug}` : `/builds?champ=${encodeURIComponent(champion.id)}`}>
                  {hasRoom ? "Room" : "Builds"}<span className="sr-only"> for {champion.name}</span>
                </Link>
              </span>
            </span>
          </th>
          <td className={styles.num}>{champion.games}</td>
          <td className={styles.num}>{recordRate(champion)}<small>{champion.wins}W–{champion.losses}L</small></td>
          <td className={styles.num}>{kda === "0 deaths" ? kda : kda}<small>{champion.kda.count < champion.games ? `${gameCount(champion.kda.count)} measured` : undefined}</small></td>
          <td className={styles.num}>{champion.csPerMinute.value?.toFixed(1) ?? "—"}<small>{champion.csPerMinute.count < champion.games ? `${gameCount(champion.csPerMinute.count)} measured` : undefined}</small></td>
          <td className={styles.num}>
            {champion.rating.value !== null ? <>{champion.rating.value.toFixed(1)}<small>{gameCount(champion.rating.count)} rated</small>
              <RatingSparkline values={champion.ratingSeries} champion={champion.name} /></> : "—"}
          </td>
          <td className={styles.num}>{champion.damageShare.value !== null
            ? <>{Math.round(champion.damageShare.value * 100)}%<small>{champion.damageShare.count < champion.games ? `${gameCount(champion.damageShare.count)} measured` : undefined}</small></>
            : "—"}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export function PlayerRoleBreakdown({ analytics, partial }: Props) {
  const records = analytics.roleRecords;
  return <section className={styles.panel} aria-labelledby="player-role-breakdown">
    <h2 id="player-role-breakdown">Role breakdown</h2>
    <SampleScope analytics={analytics} partial={partial} />
    {records.length > 0 ? <ul className={styles.roleRecords}>
      {records.map(record => <li key={record.name}>
        <span>{record.name}{record.preferred && <span className={styles.preferred}>Preferred</span>}</span>
        <span>{gameCount(record.games)} · {record.wins}W–{record.losses}L · {recordRate(record)} WR</span>
        <span>{record.rating.value !== null
          ? <>Avg rating {record.rating.value.toFixed(1)} <small>({gameCount(record.rating.count)} rated)</small></>
          : "Not rated"}</span>
      </li>)}
    </ul> : <p className={styles.meta}>Riot did not record a role for these queues.</p>}
  </section>;
}

function RankedRows({ records }: { records: PlayerAnalytics["rankedWeek"] }) {
  const max = Math.max(0, ...records.map(record => record.games));
  const rowList = (subset: typeof records) => <ul className={styles.bars}>
    {subset.map(record => <li key={record.id}><span>{record.name}</span>
      <RecordBar record={record} max={max} /><strong>{record.wins}W–{record.losses}L</strong>
    </li>)}
  </ul>;
  return <>
    {rowList(records.slice(0, CHAMPIONS_SHOWN))}
    {records.length > CHAMPIONS_SHOWN && <details className={styles.disclosure}>
      <summary>Show {records.length - CHAMPIONS_SHOWN} more ranked champions</summary>
      {rowList(records.slice(CHAMPIONS_SHOWN))}
    </details>}
  </>;
}

export function PlayerChampionAnalytics({ analytics, partial, patch, visibleRooms, sort }: Props & {
  patch: string; visibleRooms?: ReadonlySet<string>; sort?: ChampionSort;
}) {
  const { champions, rankedWeek, matchups } = analytics;
  const ratedGames = champions.reduce((total, champion) => total + champion.rating.count, 0);
  return <section className={styles.panel} aria-labelledby="player-champion-pool">
    <h2 id="player-champion-pool">Champion pool</h2>
    <SampleScope analytics={analytics} partial={partial} />
    {champions.length > 0 && <>
      <ChampionTable champions={champions} patch={patch} visibleRooms={visibleRooms} sort={sort} />
      <p className={styles.meta}>
        Average rating covers {ratedGames} rated {ratedGames === 1 ? "game" : "games"} in this sample.
        Team damage share is only recorded for games stored with damage data.
      </p>
    </>}
    {matchups.length > 0 && <>
      <h3>Head-to-head</h3>
      <p className={styles.meta}>Opponent champions met at least twice in this sample.</p>
      <ul className={styles.matchups}>
        {matchups.map(matchup => <li key={matchup.name}>
          <span>vs {matchup.name}</span>
          <strong>{matchup.wins}W–{matchup.losses}L</strong>
          <span className={styles.meta}>{gameCount(matchup.games)}</span>
        </li>)}
      </ul>
    </>}
    <h3>Ranked W/L by champion · last 7 days</h3>
    <p className={styles.meta}>Solo/Duo and Flex games in this snapshot · {dates.formatRange(analytics.weekStart, analytics.asOf)} UTC</p>
    {rankedWeek.length ? <RankedRows records={rankedWeek} /> : <p className={styles.meta}>No ranked results from this period are available in the snapshot.</p>}
  </section>;
}
