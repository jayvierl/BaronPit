"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { buildsHref } from "@/lib/build-sharing";
import { championClasses, championDirectoryFilters, championDirectoryHref } from "@/lib/champion-navigation";
import type { ChampionInfo } from "@/lib/riot";
import { BuildsLink } from "./builds-link";
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

export function ChampionDirectory({ champions, patch, roomSlugs, initial, searchReturn }: {
  champions: ChampionInfo[];
  patch: string;
  roomSlugs: string[];
  initial: ReturnType<typeof championDirectoryFilters>;
  searchReturn?: string;
}) {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => championDirectoryHref(initial).slice("/champions".length));
  const query = new URLSearchParams(search);
  const filters = championDirectoryFilters(query.get("q"), query.get("class"));
  const needle = filters.q.trim().toLowerCase();
  const filtered = Boolean(needle || filters.tag);
  const publicRooms = new Set(roomSlugs);
  const directory = filtered || searchReturn ? championDirectoryHref(filters, searchReturn) : undefined;
  const shown = filtered ? champions.filter(champion => (
    (!needle || champion.name.toLowerCase().includes(needle) || champion.id.toLowerCase().includes(needle)) &&
    (!filters.tag || champion.tags.includes(filters.tag))
  )) : champions;

  return (
    <>
      <form action="/champions" method="get" className={styles.toolbar} aria-label="Champion filters">
        {searchReturn && <input type="hidden" name="from" value={searchReturn} />}
        <input className="inline" type="search" aria-label="Filter champions" name="q" placeholder="Champion name"
          value={filters.q} maxLength={80} onChange={event => setFilter("q", event.target.value)} />
        <select className="inline" name="class" aria-label="Champion class" value={filters.tag}
          onChange={event => setFilter("class", event.target.value)}>
          <option value="">All classes</option>
          {championClasses.map(tag => <option key={tag} value={tag}>{tag}</option>)}
        </select>
        <button className="btn small secondary" type="submit">Apply</button>
        {filtered && <Link href={championDirectoryHref(championDirectoryFilters(null, null), searchReturn)} className={styles.clear} prefetch={false}>Clear filters</Link>}
      </form>
      {filtered && <p className={styles.result} role="status">{shown.length
        ? `${shown.length} matching champion${shown.length === 1 ? "" : "s"}`
        : "No champions match these filters."}</p>}
      {shown.length > 0 && <ul className={styles.grid} role="list">
        {shown.map(champion => {
          const roomSlug = `champ-${champion.id.toLowerCase()}`;
          const room = `/rooms/${encodeURIComponent(roomSlug)}` + (directory ? `?${new URLSearchParams({ from: directory })}` : "");
          return (
            <li key={champion.id} className={styles.card}>
              <div className={styles.identity}>
                <ChampionPortrait id={champion.id} patch={patch} size={44} />
                <div>
                  <Link href={`/champions/${encodeURIComponent(champion.id)}`} prefetch={false}><strong>{champion.name}</strong></Link>
                  <small>{champion.tags.join(" · ")}</small>
                </div>
              </div>
              <div className={styles.links}>
                {publicRooms.has(roomSlug) && <Link aria-label={`${champion.name} room`} href={room} prefetch={false}>Room</Link>}
                <BuildsLink aria-label={`${champion.name} builds`} href={buildsHref({ champion: champion.id, from: directory })}>Builds</BuildsLink>
              </div>
            </li>
          );
        })}
      </ul>}
    </>
  );
}
