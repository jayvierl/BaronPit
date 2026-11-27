import Link from "next/link";
import { matchRoleLabels } from "@/lib/match-context";
import { isPlatform, playerStatsHref, PLATFORMS } from "@/lib/platforms";
import { publicPatch } from "@/lib/patch-notes";
import type { championRoomPulse } from "@/lib/player-insights";
import type { ChampionInfo } from "@/lib/riot";
import { roomFeedHref, type roomFeeds } from "@/lib/room-feed";
import { withSearchReturn } from "@/lib/search-scopes";
import styles from "./room.module.css";

type FeedKey = typeof roomFeeds[number]["key"];
type Sample = Awaited<ReturnType<typeof championRoomPulse>>;
type Section = "overview" | "discussions" | "builds";

const number = new Intl.NumberFormat("en-US");

export function championRoomSection(view: unknown, feed: FeedKey): Section {
  if (feed === "builds") return "builds";
  return view === "discussions" || feed !== "all" ? "discussions" : "overview";
}

export function championRoomHref(slug: string, section: Section, from?: string, feed: FeedKey = "all") {
  const path = roomFeedHref(slug, section === "builds" ? "builds" : feed);
  return withSearchReturn(section === "discussions" && feed === "all" ? path + "?view=discussions" : path, from);
}

export function ChampionRoomTabs({ slug, section, from }: { slug: string; section: Section; from?: string }) {
  const sections = [{ id: "overview", label: "Overview" }, { id: "discussions", label: "Discussions" }, { id: "builds", label: "Builds" }] as const;
  return <nav className={styles.roomTabs} aria-label="Champion hub">
    {sections.map(({ id, label }) => <Link key={id} href={championRoomHref(slug, id, from)}
      aria-current={section === id ? "page" : undefined} prefetch={false}>{label}</Link>)}
  </nav>;
}

export function ChampionRoomOverview({ champion, championId, patch, sample }: {
  champion?: ChampionInfo;
  championId: string;
  patch: string;
  sample: Sample | null;
}) {
  const name = champion?.name ?? championId;
  const roleGames = sample?.roles.reduce((total, entry) => total + entry.games, 0) ?? 0;
  const players = sample?.topPlayers.filter(player => isPlatform(player.platform) && player.name && player.tag) ?? [];
  return (
    <section className={styles.hubPanel} aria-labelledby="champion-sample-heading">
      <header className={styles.sampleHeader}>
        <h2 id="champion-sample-heading">Recent match sample</h2>
        {champion?.tags.length ? <ul className={styles.classTags} aria-label="Champion classes" role="list">
          {champion.tags.map(tag => <li key={tag}>{tag}</li>)}
        </ul> : null}
      </header>
      {sample === null ? <p className="meta" role="status">Match sample temporarily unavailable.</p> : sample.games > 0 ? <>
        <dl className={styles.sampleStats}>
          <div><dt>Sampled players</dt><dd>{number.format(sample.players)}</dd></div>
          <div><dt>Appearances</dt><dd>{number.format(sample.games)}</dd></div>
          <div><dt>Wins · losses</dt><dd>{number.format(sample.wins)} · {number.format(sample.games - sample.wins)}</dd></div>
        </dl>
        <p className="meta">Up to 20 saved games per player from up to 300 of the most recently refreshed profiles. The sample can span public queues and patches. A game can include more than one player appearance.</p>
        {roleGames > 0 ? <>
          <h3>Observed roles</h3>
          <ul className={styles.roleRows} role="list">
            {sample.roles.map(({ role, games }) => <li key={role}><span>{matchRoleLabels[role]}</span><strong>{number.format(games)}</strong></li>)}
          </ul>
          <p className="meta">{number.format(roleGames)} of {number.format(sample.games)} appearances had role data.</p>
        </> : <p className="meta">No lane roles were recorded in this sample.</p>}
        {players.length > 0 && <details className={styles.details}>
          <summary>Players in this sample</summary>
          {players.map(({ name, tag, platform, games, wins }) => {
            const href = playerStatsHref(platform, `${name}#${tag}`) + `&champion=${encodeURIComponent(championId)}#match-history`;
            return <Link key={`${platform}/${name}#${tag}`} className={styles.samplePlayer} href={href} prefetch={false}>
              <span><strong>{name}#{tag}</strong><small>{PLATFORMS.find(region => region.id === platform)?.label ?? platform}</small></span>
              <span>{number.format(games)} {games === 1 ? "game" : "games"} · {wins}W–{games - wins}L</span>
            </Link>;
          })}
        </details>}
      </> : <p className="meta">No {name} appearances in the current sample.</p>}
      <div className={styles.hubLinks}>
        <Link href={`/questions?champion=${encodeURIComponent(championId)}`} prefetch={false}>Browse {name} questions</Link>
        <Link href="/player" prefetch={false}>Look up a player</Link>
        <Link href="/rooms/patch-meta" prefetch={false}>Discuss {publicPatch(patch) ? `patch ${publicPatch(patch)}` : "patch notes"}</Link>
      </div>
    </section>
  );
}
