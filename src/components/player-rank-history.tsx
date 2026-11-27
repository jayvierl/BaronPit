import { APP_NAME } from "@/lib/brand";
import { PLATFORMS } from "@/lib/platforms";
import {
  RANK_HISTORY_QUEUES, rankHistoryLabel, rankHistoryPosition, rankHistoryPositionLabel,
  type QueueRankHistory, type RankHistoryPoint,
} from "@/lib/rank-history";
import { readPlayerRankHistory } from "@/lib/rank-history-store";
import styles from "./player-rank-history.module.css";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dateLabel = (day: string) => dateFormat.format(new Date(day));
const pointTime = (point: RankHistoryPoint) => Date.parse(point.day);

function RankTrend({ points, queue }: { points: RankHistoryPoint[]; queue: string }) {
  const first = points[0];
  const last = points[points.length - 1];
  const start = pointTime(first);
  const end = pointTime(last);
  const ranks = points.map(rankHistoryPosition);
  const low = Math.floor(Math.min(...ranks) / 100) * 100;
  const high = Math.max(low + 100, Math.ceil(Math.max(...ranks) / 100) * 100);
  const width = 360;
  const height = 108;
  const gutter = 5;
  const plotted = points.map((point, index) => ({
    ...point,
    x: gutter + (width - 2 * gutter) * (pointTime(point) - start) / (end - start),
    y: height - gutter - (height - 2 * gutter) * (ranks[index] - low) / (high - low),
  }));
  const path = plotted.map(({ x, y, year }, index) => {
    const continuous = year != null && year === plotted[index - 1]?.year;
    return `${continuous ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const hasUnclassified = points.some(point => point.year == null);
  const hasRollover = new Set(points.flatMap(point => point.year ?? [])).size > 1;
  return (
    <figure className={styles.figure}>
      <div className={styles.chart}>
        <div className={styles.rankAxis} aria-hidden="true">
          <span>{rankHistoryPositionLabel(high)}</span><span>{rankHistoryPositionLabel(low)}</span>
        </div>
        <svg role="img" aria-label={`Rank changes in ${queue} from ${dateLabel(first.day)} to ${dateLabel(last.day)}`}
          viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={styles.plot}>
          {[gutter, height / 2, height - gutter].map(y => (
            <line key={y} x1={gutter} x2={width - gutter} y1={y} y2={y} className={styles.gridline} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={path} className={styles.line} vectorEffect="non-scaling-stroke" />
          {plotted.map(point => (
            <circle key={point.day} cx={point.x} cy={point.y} r="3" className={styles.point}>
              <title>{`${dateLabel(point.day)} · ${rankHistoryLabel(point)}`}</title>
            </circle>
          ))}
        </svg>
        <div className={styles.dateAxis} aria-hidden="true"><time dateTime={first.day}>{dateLabel(first.day)}</time>
          <time dateTime={last.day}>{dateLabel(last.day)}</time></div>
      </div>
      <figcaption className={styles.note}>
        Higher points show higher divisions or more LP. Apex tiers share an LP scale.
        {hasRollover && " Separate lines mark ranked years."}
        {hasUnclassified && " Points outside confirmed ranked years are shown individually."}
      </figcaption>
    </figure>
  );
}

function QueueHistory({ history }: { history: QueueRankHistory }) {
  const { recent, previousYears } = history;
  const last = recent[recent.length - 1];
  const queue = RANK_HISTORY_QUEUES[history.queue];
  if (!last) return null;
  return (
    <div className={styles.queue}>
      <div className={styles.queueHeading}><h3>{queue}</h3><span><small>Last recorded</small> {rankHistoryLabel(last)}</span></div>
      {recent.length >= 2
        ? <>
            <RankTrend points={recent} queue={queue} />
            <details className={styles.records}>
              <summary>Recorded ranks <span className={styles.note}>· {recent.length} days</span></summary>
              <table className={styles.table} aria-label={`Recorded ranks in ${queue}`}>
                <thead><tr><th scope="col">Day (UTC)</th><th scope="col">Rank</th><th scope="col">Wins–losses</th></tr></thead>
                <tbody>{[...recent].reverse().map(point => (
                  <tr key={point.day}><td><time dateTime={point.day}>{dateLabel(point.day)}</time></td>
                    <td>{rankHistoryLabel(point)}</td><td>{point.wins}–{point.losses}</td></tr>
                ))}</tbody>
              </table>
            </details>
          </>
        : <p className={styles.note}>One recorded day · <time dateTime={last.day}>{dateLabel(last.day)}</time>. Check back after another ranked refresh.</p>}
      {previousYears.length > 0 && (
        <table className={styles.table} aria-label={`Past ranked years in ${queue}`}>
          <thead><tr><th scope="col">Ranked year</th><th scope="col">Last recorded rank</th><th scope="col">Day (UTC)</th></tr></thead>
          <tbody>{previousYears.map(point => (
            <tr key={point.year}><th scope="row">{point.year}</th>
              <td>{rankHistoryLabel(point)}</td><td><time dateTime={point.day}>{dateLabel(point.day)}</time></td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

export async function PlayerRankHistory({ puuid, platform }: { puuid: string; platform: string }) {
  const histories = await readPlayerRankHistory(puuid, platform).catch(() => null);
  const queues = histories?.filter(history => history.recent.length > 0) ?? [];
  const region = PLATFORMS.find(shard => shard.id === platform)?.label;
  return (
    <section aria-labelledby="rank-history-title" className={styles.section}>
      <h2 id="rank-history-title">Rank history</h2>
      {histories === null
        ? <p className={styles.note}>Rank history is temporarily unavailable.</p>
        : queues.length === 0
          ? <p className={styles.note}>History starts when {APP_NAME} records a ranked refresh for this player{region ? ` on ${region}` : ""}.</p>
          : <>
              <p className={styles.note}>Showing {region ?? "this region’s"} ranked observations. {APP_NAME} keeps the latest successful observation per queue and UTC day, including when a player changes regions that day.</p>
              {queues.map(history => <QueueHistory key={history.queue} history={history} />)}
            </>}
    </section>
  );
}
