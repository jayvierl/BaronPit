"use client";

import { useState } from "react";
import Link from "next/link";
import type { Room } from "@/lib/rooms";
import { ChampionPortrait } from "./champion-portrait";
import { JoinButton } from "./social-ui";

const pageSize = 18;

export function RoomDirectory({ rooms, patch, signedIn }: {
  rooms: (Room & { joined: boolean })[]; patch: string; signedIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(0);
  const normalized = query.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const matches = rooms.filter(room => (room.name + room.slug).toLowerCase().replace(/[^a-z0-9]/g, "").includes(normalized));
  const visible = matches.slice(0, limit);
  return (
    <div>
      <input type="search" aria-label="Find a room" placeholder="Search rooms by champion or topic"
        value={query} onChange={e => { setQuery(e.target.value); setLimit(e.target.value.trim() ? pageSize : 0); }}
        style={{ width: "100%" }}/>
      <p className="meta" role="status">{matches.length === 0 ? "No rooms match this search." : limit > 0
        ? `Showing ${visible.length} of ${matches.length} rooms` : `${rooms.length} searchable rooms`}</p>
      {visible.map(room => (
        <div key={room.id} className="list-row">
          <Link href={`/rooms/${room.slug}`} prefetch={false} style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            {room.championId && <ChampionPortrait id={room.championId} patch={patch} size={28}/>}
            <strong>{room.name}</strong>
          </Link>
          {signedIn && <JoinButton roomId={room.id} initial={room.joined}/>}
        </div>
      ))}
      {matches.length > limit && <button type="button" className="btn secondary" onClick={() => setLimit(limit + pageSize)}>
        {limit ? "Show more rooms" : "Browse all rooms"}
      </button>}
    </div>
  );
}
