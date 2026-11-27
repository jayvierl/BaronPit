"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { championClasses, championDirectoryFilters, championDirectoryHref } from "@/lib/champion-navigation";
import type { ChampionInfo } from "@/lib/riot";
import { ChampionPortrait } from "./champion-portrait";
import styles from "./champion-directory.module.css";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener("champion-filter", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("champion-filter", onChange);
  };
}

function setFilter(name: "q" | "class", value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event("champion-filter"));
}

export function ChampionDirectory({ champions, patch, roomSlugs, initial }: {
  champions: ChampionInfo[];
  patch: string;
  roomSlugs: string[];
  initial: ReturnType<typeof championDirectoryFilters>;
}) {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => championDirectoryHref(initial).slice("/champions".length));
  const query = new URLSearchParams(search);
  const filters = championDirectoryFilters(query.get("q"), query.get("class"));
  const needle = filters.q.trim().toLowerCase();
  const filtered = Boolean(needle || filters.tag);
  const publicRooms = new Set(roomSlugs);
  const directory = championDirectoryHref(filters);
  const shown = filtered ? champions.filter(champion => (
    (!needle || champion.name.toLowerCase().includes(needle) || champion.id.toLowerCase().includes(needle)) &&
    (!filters.tag || champion.tags.includes(filters.tag))
  )) : champions;

  return (
    <>
      <form action="/champions" method="get" className={styles.toolbar} aria-label="Champion filters">
        <input className="inline" type="search" aria-label="Filter champions" name="q" placeholder="Champion name"
          value={filters.q} maxLength={80} onChange={event => setFilter("q", event.target.value)} />
        <select className="inline" name="class" aria-label="Champion class" value={filters.tag}
          onChange={event => setFilter("class", event.target.value)}>
          <option value="">All classes</option>
          {championClasses.map(tag => <option key={tag} value={tag}>{tag}</option>)}
        </select>
        <button className="btn small secondary" type="submit">Apply</button>
        {filtered && <Link href="/champions" className={styles.clear} prefetch={false}>Clear filters</Link>}
      </form>
      {filtered && <p className={styles.result} role="status">{shown.length
        ? `${shown.length} matching champion${shown.length === 1 ? "" : "s"}`
        : "No champions match these filters."}</p>}
      {shown.length > 0 && <ul className={styles.grid} role="list">
        {shown.map(champion => {
          const roomSlug = `champ-${champion.id.toLowerCase()}`;
          const room = `/rooms/${encodeURIComponent(roomSlug)}` + (filtered ? `?${new URLSearchParams({ from: directory })}` : "");
          return (
            <li key={champion.id} className={styles.card}>
              <div className={styles.identity}>
                <ChampionPortrait id={champion.id} patch={patch} size={44} />
                <div>
                  <strong>{champion.name}</strong>
                  <small>{champion.tags.join(" · ")}</small>
                </div>
              </div>
              <div className={styles.links}>
                {publicRooms.has(roomSlug) && <Link aria-label={`${champion.name} room`} href={room} prefetch={false}>Room</Link>}
                <Link aria-label={`${champion.name} builds`} href={`/builds?${new URLSearchParams({ champ: champion.id })}`} prefetch={false}>Builds</Link>
              </div>
            </li>
          );
        })}
      </ul>}
    </>
  );
}
