"use client";

import { useState } from "react";
import Link from "next/link";
import type { Room } from "@/lib/rooms";
import { ChampionPortrait } from "./champion-portrait";
import { JoinButton } from "./social-ui";
import styles from "@/app/rooms/rooms.module.css";

const pageSize = 18;
const roomKey = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function directoryPath(query: string, limit: number) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (limit > (query.trim() ? pageSize : 0)) params.set("limit", String(limit));
  return "/rooms" + (params.size ? "?" + params : "") + "#room-directory";
}

export function RoomDirectory({ rooms, patch, signedIn, initialQuery, initialLimit }: {
  rooms: (Room & { joined: boolean })[]; patch: string; signedIn: boolean; initialQuery: string; initialLimit: number;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [limit, setLimit] = useState(Math.max(initialLimit, initialQuery ? pageSize : 0));
  const normalized = roomKey(query);
  const matches = !query.trim() ? rooms : normalized
    ? rooms.filter(room => roomKey(room.name).includes(normalized) || roomKey(room.slug).includes(normalized)) : [];
  const visible = matches.slice(0, limit);
  return (
    <div>
      <form action="/rooms#room-directory" role="search" className={styles.searchForm}>
        <input type="search" name="q" aria-label="Find a room" placeholder="Search rooms by champion or topic" maxLength={80} enterKeyHint="search"
          value={query} onChange={e => { setQuery(e.target.value); setLimit(e.target.value.trim() ? pageSize : 0); }}
          className={styles.search}/>
        <button type="submit">Search</button>
      </form>
      <p className={styles.resultStatus} role="status">{matches.length === 0 ? "No rooms match this search." : limit > 0
        ? `Showing ${visible.length} of ${matches.length} rooms` : ""}</p>
      {visible.map(room => (
        <div key={room.id} className="list-row">
          <Link href={`/rooms/${room.slug}`} prefetch={false} className={styles.roomLink}
            onNavigate={() => window.history.replaceState(null, "", directoryPath(query, limit))}>
            {room.championId && <ChampionPortrait id={room.championId} patch={patch} size={28}/>}
            <strong>{room.name}</strong>
          </Link>
          {signedIn && <JoinButton roomId={room.id} initial={room.joined}/>}
        </div>
      ))}
      {matches.length > limit && <Link className={styles.browse} href={directoryPath(query, limit + pageSize)} prefetch={false} scroll={false}>
        {limit ? "Show more rooms" : "Browse all rooms"}
      </Link>}
    </div>
  );
}
