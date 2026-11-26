"use client";

import Link from "next/link";
import { ChampionPortrait } from "./champion-portrait";
import { useSyncExternalStore } from "react";
import type { ChampionInfo } from "@/lib/riot";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener("champion-filter", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("champion-filter", onChange);
  };
}
function setFilter(value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("q", value);
  else url.searchParams.delete("q");
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event("champion-filter"));
}

export function ChampionDirectory({ champions, patch, roomSlugs }: {
  champions: ChampionInfo[]; patch: string; roomSlugs: string[];
}) {
  const query = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("q") || "",
    () => "",
  );
  const filter = query.trim().toLowerCase();
  const publicRooms = new Set(roomSlugs);
  const shown = filter
    ? champions.filter(
        (champion) =>
          champion.name.toLowerCase().includes(filter) || champion.id.toLowerCase().includes(filter),
      )
    : champions;
  return (
    <>
      <div style={{ margin: "12px 0 18px" }}>
        <input
          className="inline"
          type="search"
          aria-label="Filter champions"
          name="q"
          placeholder="Filter champions…"
          value={query}
          onChange={(event) => setFilter(event.target.value)}
          style={{ width: "min(100%, 260px)" }}
        />
        {query && (
          <button type="button" className="text-btn" onClick={() => setFilter("")}>
            Clear
          </button>
        )}
        <div className="meta" role="status">
          {filter &&
            (shown.length
              ? `${shown.length} matching champion${shown.length === 1 ? "" : "s"}`
              : "No champions match that name.")}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {shown.map((c) => {
          const roomSlug = `champ-${c.id.toLowerCase()}`;
          return (
            <div key={c.id} className="card" style={{ padding: 13 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <ChampionPortrait id={c.id} patch={patch}/>
                <div>
                  <strong style={{ fontSize: 15 }}>{c.name}</strong>
                  <div className="meta" style={{ fontSize: 12 }}>
                    {c.tags.join(" · ")}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 9, fontSize: 13, fontWeight: 700 }}>
                {publicRooms.has(roomSlug) && (
                  <Link aria-label={c.name + " room"} href={`/rooms/${roomSlug}`} prefetch={false}>
                    Room
                  </Link>
                )}
                <Link aria-label={c.name + " builds"} href={`/builds?champ=${encodeURIComponent(c.id)}`}>
                  Builds
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
