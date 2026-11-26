import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Composer } from "@/components/composer";
import { GuestPostDraft } from "@/components/guest-draft";
import { PilotVisit } from "@/components/pilot-visit";
import { PostCard } from "@/components/post-card";
import { SafetyReport } from "@/components/safety-report";
import { ShareLink } from "@/components/share-link";
import { JoinButton } from "@/components/social-ui";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { publicPatch } from "@/lib/patch-notes";
import { playerStatsHref, PLATFORMS } from "@/lib/platforms";
import { championRoomPulse } from "@/lib/player-insights";
import { gameCount, splashUrl } from "@/lib/pure";
import { currentPatch, championList } from "@/lib/riot";
import { readRoomFeed, roomFeedFromParam, roomFeedHref, roomFeeds } from "@/lib/room-feed";
import { getRoom } from "@/lib/rooms";
import { signInHref } from "@/lib/signin-return";
import styles from "./room.module.css";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ feed?: string | string[] }>;
}) {
  const [{slug}, search, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  const viewerId = user?.id ?? null;
  const viewerIdentity = publicAvatarIdentity(user);
  const view = roomFeedFromParam(search.feed);
  const [room, patch, champions] = await Promise.all([getRoom(slug, user?.id), currentPatch(), championList()]);
  if (!room) notFound();
  const [posts, brief] = await Promise.all([
    readRoomFeed(room.id, viewerId, view).catch(() => null),
    room.championId ? championRoomPulse(room.championId).catch(() => null) : null,
  ]);
  const champInfo = room.championId ? champions.find(c => c.id === room.championId) : null;
  const destination = roomFeedHref(room.slug, view.key);

  return (
    <div>
      {user?.pilotActive && <PilotVisit kind="social"/>}
      {room.championId ? (
        <Image unoptimized width={1215} height={717} className={`room-banner ${styles.cover}`} src={splashUrl(room.championId)} alt="" />
      ) : room.slug === "general" && (
        <picture>
          <source media="(max-width: 480px)" srcSet="/baron-room-480.webp 1x, /baron-room-960.webp 2x" />
          <Image unoptimized width={960} height={536} className={`room-banner room-banner-pit ${styles.cover}`} src="/baron-room-960.webp" alt="" />
        </picture>
      )}

      <header className={styles.header}>
        <div className={styles.byline}>
          {room.championId && <ChampionPortrait id={room.championId} patch={patch} size={44} compact />}
          <div>
            <h1>{room.name}</h1>
            <span className="meta">
              {room.members} member{room.members === 1 ? "" : "s"}
              {champInfo && <> · {champInfo.title}</>}
            </span>
          </div>
        </div>
        <div className={styles.actions}>
          {user ? <JoinButton roomId={room.id} initial={room.joined} /> : <Link href={signInHref(destination)} className="btn small">Sign in to join</Link>}
          {room.slug === "lfg-lobby" && <Link href="/lfg" className="btn small secondary">Open Duo Finder</Link>}
          <ShareLink path={destination} kind="room" />
          <SafetyReport kind="room" targetId={room.id} />
        </div>
        {room.raidUntil && <p className="notice warn" role="status">Room protection is active until {new Date(room.raidUntil).toLocaleTimeString()}. Links are paused. Leave 15 seconds between posts and replies.</p>}
        <details className={styles.details}>
          <summary>{room.championId ? "About & room stats" : "About this room"}</summary>
          <p>{room.description}</p>
          {room.host && <p className="meta">Hosted by <Link href={`/u/${room.host.id}`}>{room.host.name}</Link></p>}
          {room.championId && <p className="meta">
            {champInfo && <>{champInfo.tags.join(" / ")} · </>}
            <Link href={`/questions?champion=${encodeURIComponent(room.championId)}`}>Browse {champInfo?.name || room.championId} questions</Link>
            {" · "}<Link href="/rooms/patch-meta">Discuss patch {publicPatch(patch) || patch}</Link>
          </p>}
          {brief && <>
            <h2>{room.championId} room pulse</h2>
            {brief.games === 0 ? <p className="meta">No {room.championId} games in the sampled champion pools yet. <Link href="/player">Look up a player</Link></p> : <>
              <div className="kv">
                <div><b>{brief.players}</b><span>Sampled players</span></div>
                <div><b>{brief.games}</b><span>Recent games</span></div>
                <div><b>{Math.round((brief.wins / brief.games) * 100)}%</b><span>Win rate</span></div>
              </div>
              {brief.topPlayers.map(p => (
                <Link key={`${p.platform}/${p.name}#${p.tag}`} className="match-row" prefetch={false}
                  href={playerStatsHref(p.platform, p.name + "#" + p.tag)}>
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}><strong>{p.name}#{p.tag}</strong>
                    <small className="meta" style={{ display: "block" }}>{PLATFORMS.find(region => region.id === p.platform)?.label ?? p.platform}</small></span>
                  <span className="meta">{gameCount(p.games)} · {p.wins}W–{p.games - p.wins}L</span>
                </Link>
              ))}
            </>}
          </>}
        </details>
      </header>

      <details className={styles.compose}>
        <summary>Start a thread<span aria-hidden="true">＋</span></summary>
        {user
          ? <Composer key={user.id + ":" + room.id} viewerId={user.id} roomId={room.id} patch={patch} champions={champions.map(c => c.id)} viewerIdentity={viewerIdentity} />
          : <GuestPostDraft roomId={room.id} destination={destination + "#compose"} label={`Post in ${room.name}`}/>}
      </details>
      <nav className={styles.roomTabs} aria-label="Room feed filters">
        {roomFeeds.map(({key, label}) => <Link key={key} href={roomFeedHref(room.slug, key)} scroll={false}
          aria-current={key === view.key ? "page" : undefined}>{label}</Link>)}
      </nav>
      {posts === null ? <p className="empty" role="status">Room posts are temporarily unavailable. Refresh to try again.</p> : posts.length === 0
        ? <div className={`empty ${styles.empty}`}>
            {view.key === "all" ? <>No threads in this room yet.<br/><a href="#compose">Start the first thread</a></>
              : <>No {view.label.toLowerCase()} in this room yet.<br/><Link href={roomFeedHref(room.slug, "all")} scroll={false}>See all threads</Link></>}
          </div>
        : posts.map(p => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={viewerId} viewerIdentity={viewerIdentity} />)}
    </div>
  );
}
