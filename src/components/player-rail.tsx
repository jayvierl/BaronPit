import type { ActivityDay, PlayerAnalytics } from "@/lib/player-analytics";
import { gameCount } from "@/lib/pure";
import styles from "./player-rail.module.css";

type Props = { analytics: PlayerAnalytics; partial?: boolean; className?: string };

const rangeFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

function dayDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function resultOf(day: ActivityDay): "empty" | "win" | "loss" | "mixed" {
  if (!day.games) return "empty";
  return day.wins > day.losses ? "win" : day.losses > day.wins ? "loss" : "mixed";
}

function levelOf(day: ActivityDay) {
  return Math.min(day.games, 4);
}

function hoursText(hours: number) {
  return hours >= 10 ? String(Math.round(hours)) : String(Math.round(hours * 10) / 10);
}

/** GitHub-style week columns (Monday first) over the stored sample's own
 * date range. The first week is padded so weekday rows line up. */
function ActivityGrid({ days }: { days: readonly ActivityDay[] }) {
  const first = dayDate(days[0].date);
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (ActivityDay | null)[] = [...Array<null>(lead).fill(null), ...days];
  const weeks: (ActivityDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  let lastMonth = "";
  return <div className={styles.weeks}>
    {weeks.map((week, index) => {
      const dated = week.find((day): day is ActivityDay => day !== null);
      const month = dated ? monthFormat.format(dayDate(dated.date)) : "";
      const label = month && month !== lastMonth ? month : "";
      if (month) lastMonth = month;
      return <div key={index} className={styles.week}>
        <span className={styles.month} aria-hidden="true">{label}</span>
        {week.map((day, row) => day === null
          ? <span key={row} className={styles.cell} data-result="pad" />
          : <span key={row} className={styles.cell} data-result={resultOf(day)} data-level={levelOf(day)}
              title={day.games
                ? `${dayFormat.format(dayDate(day.date))} · ${gameCount(day.games)} · ${day.wins}W–${day.losses}L`
                : `${dayFormat.format(dayDate(day.date))} · No games`} />)}
      </div>;
    })}
  </div>;
}

function RecentActivity({ analytics, partial }: Props) {
  const { calendar } = analytics;
  return <section className={styles.panel} aria-labelledby="player-recent-activity">
    <h2 id="player-recent-activity" className={styles.heading}>Recent activity</h2>
    {calendar.days.length > 0 && calendar.start && calendar.end ? <>
      <p className={styles.meta}>
        Stored games · {rangeFormat.formatRange(dayDate(calendar.start), dayDate(calendar.end))} · UTC
        {partial && " · Available history may have gaps"}
      </p>
      <div role="img" aria-label={`${calendar.totalGames} stored games across ${calendar.days.filter(day => day.games > 0).length} active days, ${calendar.start} to ${calendar.end}`}>
        <ActivityGrid days={calendar.days} />
      </div>
      <p className={styles.legend} aria-hidden="true">
        <span><i data-result="win" data-level="4" /> Win day</span>
        <span><i data-result="mixed" data-level="4" /> Mixed</span>
        <span><i data-result="loss" data-level="4" /> Loss day</span>
        <span className={styles.legendNote}>Darker = more games</span>
      </p>
      <p className={styles.totals}>
        <span><strong>{gameCount(calendar.totalGames)} played</strong></span>
        <span><strong>{hoursText(calendar.totalHours)} hours played</strong></span>
      </p>
    </> : <p className={styles.meta}>Match dates are unavailable in this sample.</p>}
  </section>;
}

function TopRoles({ analytics, partial }: Props) {
  const records = analytics.roleRecords;
  if (!records.length) return null;
  const max = Math.max(1, ...records.map(record => record.games));
  return <section className={styles.panel} aria-labelledby="player-top-roles">
    <h2 id="player-top-roles" className={styles.heading}>Top roles</h2>
    <p className={styles.meta}>{partial ? `${gameCount(analytics.sampleGames, "public")} available` : `Latest ${gameCount(analytics.sampleGames, "public")}`}</p>
    <ul className={styles.roles}>
      {records.map(record => <li key={record.name}>
        <span className={styles.roleLine}>
          <span className={styles.roleName}>{record.name}
            {record.preferred && <span className={styles.preferred}>Preferred</span>}
          </span>
          <span className={styles.roleRecord}>
            {gameCount(record.games)} · {record.wins}W–{record.losses}L · {record.games ? Math.round(100 * record.wins / record.games) : 0}% WR
          </span>
        </span>
        <span className={styles.track} aria-hidden="true">
          <i className={styles.wins} style={{ width: `${record.wins * 100 / max}%` }} />
          <i className={styles.losses} style={{ width: `${record.losses * 100 / max}%` }} />
        </span>
      </li>)}
    </ul>
  </section>;
}

/** Upper-left rail for the Player Stats overview: recent activity, then top
 * roles. Placement is the overview grid's job (see profile.module.css); the
 * rail renders nothing when the sample has neither dated games nor roles. */
export function PlayerRail({ analytics, partial, className }: Props) {
  if (!analytics.calendar.days.length && !analytics.roleRecords.length) return null;
  return <div className={className}>
    <RecentActivity analytics={analytics} partial={partial} />
    <TopRoles analytics={analytics} partial={partial} />
  </div>;
}
