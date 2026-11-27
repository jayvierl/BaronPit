import type { CSSProperties } from "react";
import styles from "./game-asset-icon.module.css";

export function gameAssetInitials(name?: string) {
  const words = name?.replace(/[’']/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  const initials = words.length === 1 ? words[0].slice(0, 2) : words.slice(0, 3).map(word => word[0]).join("");
  return initials.toUpperCase();
}

/** Artwork stays decorative. Each caller gives the surrounding control or row its full name. */
export function GameAssetIcon({ src, name, size }: { src: string; name?: string; size: number }) {
  return <span aria-hidden="true" className={styles.icon}
    style={{ "--game-asset": `url("${src}")`, "--game-asset-size": `${size}px` } as CSSProperties}>
    {gameAssetInitials(name)}
  </span>;
}
