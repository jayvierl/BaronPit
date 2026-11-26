import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { APP_NAME } from "@/lib/brand";
import catalog from "@/lib/champion-catalog.json";
import { dbAvailable } from "@/lib/db";
import { duoEnabled } from "@/lib/duo";
import { activeConversations } from "@/lib/home-conversations";
import { trendingChampions } from "@/lib/player-insights";
import type { PostView } from "@/lib/post-types";
import type { listFeaturedRooms } from "@/lib/rooms";
import { visibleChampionRoomSlugs } from "@/lib/rooms";
import { ChampionPortrait } from "./champion-portrait";
import { HomePlayerSuggestions } from "./home-player-suggestions";
import { JoinButton } from "./social-ui";
import styles from "./home-discovery-rail.module.css";

type Props = {
  posts: readonly PostView[];
  activeTab: "everyone" | "following";
  asOf: number;
  roomsRead: ReturnType<typeof listFeaturedRooms>;
  patch: string;
  viewerId: number | null;
};

const championNames = new Map(catalog.list.map(({ id, name }) => [id, name]));
const number = new Intl.NumberFormat("en");

export function HomeDiscoveryRail({ posts, activeTab, asOf, roomsRead, patch, viewerId }: Props) {
  const matching = duoEnabled();
  const conversations = activeConversations(posts, asOf);
  return (
    <aside aria-label="Discover" className={styles.rail}>
      <form action="/search" method="get" role="search" aria-label="Community search" className={styles.search}>
        <input type="search" name="q" enterKeyHint="search" aria-label="Search the community" placeholder={`Search ${APP_NAME}`} maxLength={80} required />
        <button type="submit" aria-label="Search"><span aria-hidden="true" /></button>
      </form>

      {conversations.length > 0
        ? <ActiveConversations conversations={conversations} following={activeTab === "following"} />
        : <Suspense fallback={null}><ChampionActivity patch={patch} /></Suspense>}

      <section className={`${styles.section} ${styles.duo}`} aria-labelledby="discovery-duo-title">
        <div>
          <h2 id="discovery-duo-title">Find your duo</h2>
          <p>{matching ? "Find a partner who plays your hours and needs your role." : "Save your role and play times for verified matching."}</p>
        </div>
        <Image unoptimized src="/baron-duo.webp" width={72} height={60} alt="" />
        <Link href="/lfg" className={styles.more} prefetch={false}>
          {matching ? "Browse duos" : "Set duo preferences"} <span aria-hidden="true">→</span>
        </Link>
      </section>

      <Suspense fallback={null}><HomePlayerSuggestions viewerId={viewerId} /></Suspense>
      <Suspense fallback={null}><FeaturedRooms roomsRead={roomsRead} patch={patch} viewerId={viewerId} /></Suspense>
    </aside>
  );
}

function ActiveConversations({ conversations, following }: {
  conversations: ReturnType<typeof activeConversations>;
  following: boolean;
}) {
  return (
    <section className={styles.section} aria-labelledby="discovery-conversations-title">
      <h2 id="discovery-conversations-title">{following ? "Active in your feed" : "Active conversations"}</h2>
      <ul className={styles.list}>
        {conversations.map(({ id, preview, replies }) => <li key={id}>
          <Link href={`/post/${id}`} className={styles.conversation} prefetch={false}>
            <strong>{preview}</strong>
            <small>{`${number.format(replies)} ${replies === 1 ? "reply" : "replies"}`}</small>
          </Link>
        </li>)}
      </ul>
    </section>
  );
}

async function ChampionActivity({ patch }: Pick<Props, "patch">) {
  const sample = dbAvailable() ? await trendingChampions().catch(() => []) : [];
  const trends = sample
    .filter(({ champion, games }) => /^[a-z\d]+$/i.test(champion) && Number.isSafeInteger(games) && games > 0)
    .slice(0, 4);
  const rooms = new Set(await visibleChampionRoomSlugs(trends.map(trend => trend.champion)).catch(() => []));

  return (
    <section className={styles.section} aria-labelledby="discovery-champions-title">
      <h2 id="discovery-champions-title">Popular in recent champion pools</h2>
      {trends.length > 0 ? <>
        <p>Appearances across up to 200 cached player snapshots.</p>
        <ul className={styles.list}>
          {trends.map(({ champion, games }) => {
            const slug = `champ-${champion.toLowerCase()}`;
            const hasRoom = rooms.has(slug);
            return <li key={champion}>
              <Link href={hasRoom ? `/rooms/${slug}` : `/builds?champ=${encodeURIComponent(champion)}`} className={styles.champion} prefetch={false}>
                <ChampionPortrait compact id={champion} patch={patch} size={30} />
                <span className={styles.identity}>
                  <strong>{championNames.get(champion) ?? champion}</strong>
                  <small>{number.format(games)} {games === 1 ? "appearance" : "appearances"}{!hasRoom && " · Builds"}</small>
                </span>
              </Link>
            </li>;
          })}
        </ul>
      </> : <p>No champion pool activity to display yet.</p>}
      <Link href="/player" className={styles.more} prefetch={false}>Look up a player <span aria-hidden="true">→</span></Link>
    </section>
  );
}

async function FeaturedRooms({ roomsRead, patch, viewerId }: Pick<Props, "roomsRead" | "patch" | "viewerId">) {
  const rooms = await roomsRead;

  return (
    <section className={styles.section} aria-labelledby="discovery-rooms-title">
      <h2 id="discovery-rooms-title">Featured rooms</h2>
      {rooms.length > 0 && <ul className={styles.list}>
        {rooms.map(room => <li className={styles.room} key={room.id}>
          {room.championId && <ChampionPortrait compact id={room.championId} patch={patch} size={28} />}
          <div className={styles.identity}>
            <Link href={`/rooms/${room.slug}`} className={styles.roomLink} prefetch={false}>{room.name}</Link>
            <small>{room.host ? <>Hosted by <Link href={`/u/${room.host.id}`} prefetch={false}>{room.host.name}</Link></>
              : `${number.format(room.members)} ${room.members === 1 ? "member" : "members"}`}</small>
          </div>
          {viewerId !== null && <JoinButton roomId={room.id} initial={room.joined} />}
        </li>)}
      </ul>}
      <Link href="/rooms" className={styles.more} prefetch={false}>Browse rooms <span aria-hidden="true">→</span></Link>
    </section>
  );
}
