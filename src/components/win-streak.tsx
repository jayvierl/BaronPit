import styles from "./win-streak.module.css";

export function WinStreak({ wins }: { wins?: number | null }) {
  if (!wins) return null;
  return <span className={styles.streak}>{wins}{wins === 20 ? "+" : ""} wins in a row <span aria-hidden="true">🔥</span></span>;
}
