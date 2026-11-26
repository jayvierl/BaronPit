"use client";

import { useState } from "react";
import Link from "next/link";
import { splashUrl } from "@/lib/pure";
import type { Room } from "@/lib/social";
import { JoinButton } from "./social-ui";

/** Champion room grid with a name filter — every champion has a room now. */
export function ChampionRooms({ rooms, patch, signedIn }: {
  rooms: (Room & { joined: boolean })[]; patch: string; signedIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const shown = query
    ? rooms.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    : rooms;
  return (
    <div>
      <input
        type="text"
        placeholder="Find your champion's room…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", marginBottom: 6 }}
      />
      <div className="room-grid">
        {shown.map((r) => (
          <div key={r.id} className="card room-card">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {r.championId && <img className="room-thumb" src={splashUrl(r.championId)} alt="" />}
              <Link href={`/rooms/${r.slug}`} style={{ display: "flex", gap: 9, alignItems: "center" }}>
                {r.championId && (
                  <img className="champ-icon sm" src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${r.championId}.png`} alt="" />
                )}
                <h3>{r.name}</h3>
              </Link>
            </div>
            <p className="meta" style={{ margin: "8px 0 10px" }}>{r.description}</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="meta">{r.members} member{r.members === 1 ? "" : "s"}</span>
              {signedIn && <JoinButton roomId={r.id} initial={r.joined} />}
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="meta">No champion room matches that name.</p>}
      </div>
    </div>
  );
}
