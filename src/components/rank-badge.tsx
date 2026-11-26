import type { ReactNode } from "react";
import type { LeagueTier } from "@/lib/rank";
import styles from "./rank-badge.module.css";

export function RankBadge({ tier, children }: { tier?: LeagueTier | null; children: ReactNode }) {
  return <span className={styles.badge} data-tier={tier ?? "neutral"}>{children}</span>;
}
