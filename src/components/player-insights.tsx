import Link from "next/link";
import { matchSectionId } from "@/lib/match-history";
import type { DimensionScore, FormCurve, PerformanceIndex, PersonalBest } from "@/lib/performance-index";
import styles from "./player-insights.module.css";

const DIMENSION_FORMAT: Record<DimensionScore["key"], (value: number) => string> = {
  farming: value => `${value.toFixed(1)} CS/min`,
  aggression: value => `${Math.round(value * 100)}% kill participation`,
  survival: value => `${value.toFixed(2)} KDA`,
  vision: value => `${value.toFixed(1)} vision/min`,
  consistency: value => `${value.toFixed(1)} rating spread`,
};

function Radar({ index }: { index: PerformanceIndex }) {
  const size = 230;
  const center = size / 2;
  const radius = 78;
  const dimensions = index.dimensions;
  const point = (i: number, fraction: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / dimensions.length;
    return [center + radius * fraction * Math.cos(angle), center + radius * fraction * Math.sin(angle)] as const;
  };
  const polygon = (fraction: (dimension: DimensionScore) => number) =>
    dimensions.map((dimension, i) => point(i, fraction(dimension)).map(n => n.toFixed(1)).join(",")).join(" ");
  const summary = `Performance Index ${index.score} out of 100. ${dimensions.map(d => `${d.label} ${d.score}`).join(", ")}.`;
  return (
    <svg role="img" aria-label={summary} viewBox={`0 0 ${size} ${size}`} className={styles.radar}>
      {[0.25, 0.5, 0.75, 1].map(ring => (
        <polygon key={ring} points={polygon(() => ring)} className={styles.radarGrid} />
      ))}
      {dimensions.map((dimension, i) => {
        const [x, y] = point(i, 1);
        return <line key={dimension.key} x1={center} y1={center} x2={x} y2={y} className={styles.radarGrid} />;
      })}
      <polygon points={polygon(dimension => dimension.score / 100)} className={styles.radarShape} />
      {dimensions.map((dimension, i) => {
        const [x, y] = point(i, dimension.score / 100);
        return <circle key={dimension.key} cx={x} cy={y} r="3" className={styles.radarDot} />;
      })}
      {dimensions.map((dimension, i) => {
        const [x, y] = point(i, 1.22);
        return (
          <text key={dimension.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className={styles.radarLabel}>
            {dimension.label}
          </text>
        );
      })}
    </svg>
  );
}

export function PersonalBestsStrip({ bests, bestBaseHref }: { bests: PersonalBest[]; bestBaseHref: string }) {
  if (!bests.length) return null;
  return (
    <ul className={styles.bests}>
      {bests.map(best => {
        const section = matchSectionId(best.matchId);
        const content = (
          <>
            <small>{best.label}</small>
            <strong>{best.value}</strong>
            <span>{best.champion} · {best.win ? "Victory" : "Defeat"}</span>
          </>
        );
        return (
          <li key={best.key}>
            {section
              ? <Link href={`${bestBaseHref}${bestBaseHref.includes("?") ? "&" : "?"}match=${encodeURIComponent(best.matchId)}#${section}`} prefetch={false}>{content}</Link>
              : content}
          </li>
        );
      })}
    </ul>
  );
}

export function PerformanceIndexCard({ index, bests, bestBaseHref, partial }: {
  index: PerformanceIndex;
  bests: PersonalBest[];
  bestBaseHref: string;
  partial?: boolean;
}) {
  const scope = partial ? "recent available games" : `last ${index.games} games`;
  return (
    <section className={styles.panel} aria-labelledby="performance-index">
      <div className={styles.heading}>
        <h2 id="performance-index">Performance Index</h2>
        <p className={styles.headline}><strong>{index.score}</strong><span> / 100</span></p>
      </div>
      <p className={styles.meta}>
        Scored against {index.roleLabel ? `${index.roleLabel} games` : "games"} sampled from other Baron Pit players, across the {scope}.
        Damage is not stored in match records, so Aggression reflects kill participation only.
      </p>
      <div className={styles.layout}>
        <Radar index={index} />
        <ul className={styles.dimensions}>
          {index.dimensions.map(dimension => (
            <li key={dimension.key}>
              <span>{dimension.label}</span>
              <span className={styles.track} aria-hidden="true"><i style={{ width: `${dimension.score}%` }} /></span>
              <strong>{dimension.score}</strong>
              <small>{DIMENSION_FORMAT[dimension.key](dimension.playerAvg)} · sample {DIMENSION_FORMAT[dimension.key](dimension.poolAvg)} · better than {dimension.percentile}%</small>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.calls}>
        <div>
          <h3>Strengths</h3>
          <ul>{index.strengths.map(call => <li key={call.key}>{call.sentence}</li>)}</ul>
        </div>
        <div>
          <h3>Focus areas</h3>
          <ul>{index.focus.map(call => <li key={call.key}>{call.sentence}</li>)}</ul>
        </div>
      </div>
      {bests.length > 0 && (
        <>
          <h3>Personal bests</h3>
          <PersonalBestsStrip bests={bests} bestBaseHref={bestBaseHref} />
        </>
      )}
    </section>
  );
}

export function PersonalBestsSection({ bests, bestBaseHref, partial }: {
  bests: PersonalBest[];
  bestBaseHref: string;
  partial?: boolean;
}) {
  if (!bests.length) return null;
  return (
    <section className={styles.panel} aria-labelledby="personal-bests">
      <h2 id="personal-bests">Personal bests</h2>
      <p className={styles.meta}>Records inside the {partial ? "recent available games" : "last 20 games"}.</p>
      <PersonalBestsStrip bests={bests} bestBaseHref={bestBaseHref} />
    </section>
  );
}

export function FormCurveSparkline({ form }: { form: FormCurve }) {
  const width = 360;
  const height = 64;
  const gutter = 6;
  const points = form.points;
  const x = (i: number) => gutter + ((width - 2 * gutter) * i) / Math.max(1, points.length - 1);
  const y = (rating: number) => height - gutter - ((height - 2 * gutter) * (rating - 1)) / 9;
  const line = points.map((point, i) => `${x(i).toFixed(1)},${y(point.rating).toFixed(1)}`).join(" ");
  const label = `Baron Match Rating across the last ${points.length} rated games, oldest to newest. Average ${form.average.toFixed(1)}. ${form.sentence}`;
  return (
    <figure className={styles.form}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={styles.formPlot}>
        <polyline points={line} className={styles.formLine} />
        {points.map((point, i) => (
          <circle key={point.matchId} cx={x(i)} cy={y(point.rating)} r="3" className={point.win ? styles.formWin : styles.formLoss}>
            <title>{`${point.champion} · ${point.rating.toFixed(1)} · ${point.win ? "Victory" : "Defeat"}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className={styles.meta}>{form.sentence}</figcaption>
    </figure>
  );
}
