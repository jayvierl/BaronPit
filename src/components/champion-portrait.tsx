"use client";

import { useState } from "react";
import Image from "next/image";
import atlas from "@/lib/champion-portrait-atlas.json";

const portraitIds = new Map(atlas.ids.map((id, index) => [id, index]));
const atlasUrl = `url("/champions/${atlas.patch}.webp")`;

/** The directory's bundled Riot portraits render offline. A newer patch can overlay its current artwork. */
export function ChampionPortrait({ id, patch, size = 40 }: { id: string; patch: string; size?: number }) {
  const index = portraitIds.get(id);
  const [failedUrl, setFailedUrl] = useState("");
  const remote = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${encodeURIComponent(id)}.png`;
  const fetchNewArt = patch !== atlas.patch || index == null;
  const column = index == null ? 0 : index % atlas.columns;
  const row = index == null ? 0 : Math.floor(index / atlas.columns);
  return (
    <span
      className="champ-icon"
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
        backgroundImage: index == null ? undefined : atlasUrl,
        backgroundSize: `${atlas.columns * 100}% ${atlas.rows * 100}%`,
        backgroundPosition: `${(100 * column) / (atlas.columns - 1)}% ${(100 * row) / (atlas.rows - 1)}%`,
      }}
    >
      {index == null && id.charAt(0).toUpperCase()}
      {fetchNewArt && failedUrl !== remote && (
        <Image unoptimized fill sizes={size + "px"} src={remote} alt="" onError={() => setFailedUrl(remote)} />
      )}
    </span>
  );
}
