import type { CSSProperties } from "react";
import { AVATAR_PATCH, championAvatarArt } from "@/lib/avatar";
import styles from "./champion-portrait.module.css";

/** The directory's bundled Riot portraits render offline. A newer patch can overlay its current artwork. */
export function ChampionPortrait({ id, patch, size = 40, compact = false }: { id: string; patch: string; size?: number; compact?: boolean }) {
  const art = championAvatarArt(id, compact);
  const remote = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${encodeURIComponent(id)}.png`;
  const fetchNewArt = patch !== AVATAR_PATCH || !art;
  return (
    <span
      className={`champ-icon${fetchNewArt ? ` ${styles.current}` : ""}`}
      aria-hidden="true"
      style={{
        display: "inline-grid",
        placeItems: "center",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
        width: size,
        height: size,
        backgroundColor: "var(--field)",
        ...art,
        ...(fetchNewArt ? { "--champion-current-art": `url("${remote}")` } : {}),
      } as CSSProperties}
    >
      {!art && id.charAt(0).toUpperCase()}
    </span>
  );
}
