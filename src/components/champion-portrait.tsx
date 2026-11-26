"use client";

import { useState } from "react";
import Image from "next/image";
import { AVATAR_PATCH, championAvatarArt } from "@/lib/avatar";

/** The directory's bundled Riot portraits render offline. A newer patch can overlay its current artwork. */
export function ChampionPortrait({ id, patch, size = 40 }: { id: string; patch: string; size?: number }) {
  const art = championAvatarArt(id);
  const [failedUrl, setFailedUrl] = useState("");
  const remote = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${encodeURIComponent(id)}.png`;
  const fetchNewArt = patch !== AVATAR_PATCH || !art;
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
        ...art,
      }}
    >
      {!art && id.charAt(0).toUpperCase()}
      {fetchNewArt && failedUrl !== remote && (
        <Image unoptimized fill sizes={size + "px"} src={remote} alt="" onError={() => setFailedUrl(remote)} />
      )}
    </span>
  );
}
