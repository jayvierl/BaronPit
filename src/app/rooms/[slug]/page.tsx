import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { roomMetadata } from "@/lib/community-preview";
import { BuildsLink } from "@/components/builds-link";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Composer } from "@/components/composer";
import { GuestPostDraft } from "@/components/guest-draft";
import { PilotVisit } from "@/components/pilot-visit";
import { PostCard } from "@/components/post-card";
import { SafetyReport } from "@/components/safety-report";
import { ShareLink } from "@/components/share-link";
import { JoinButton } from "@/components/social-ui";
import { RoomBanner } from "@/components/room-artwork";
import { WardEmptyState } from "@/components/ward-mascot";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { buildsHref } from "@/lib/build-sharing";
import { readChampionDirectoryReturn } from "@/lib/champion-navigation";
import { championRoomPulse } from "@/lib/player-insights";
import { currentPatch, championList } from "@/lib/riot";
import { readRoomFeed, roomFeedFromParam, roomFeedHref, roomFeeds } from "@/lib/room-feed";
import { getRoom } from "@/lib/rooms";
import { readSearchReturn, withSearchReturn } from "@/lib/search-scopes";
import { signInHref } from "@/lib/signin-return";
import { buildFeed } from "@/lib/social";
import { ChampionRoomOverview, ChampionRoomTabs, championRoomHref, championRoomSection } from "./champion-room";
import styles from "./room.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const [{ slug }, viewer] = await Promise.all([params, getCurrentUser()]);
    return await roomMetadata(slug, viewer?.id);
  } catch {
    return { title: "Room unavailable", robots: { index: false, follow: false } };
  }
}

export default async function RoomPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ feed?: string | string[]; view?: string | string[]; from?: string | string[]; compose?: string | string[] }>;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const view = roomFeedFromParam(search.feed);
  const searchReturn = readSearchReturn(search.from);
  const directoryReturn = readChampionDirectoryReturn(search.from);
  const context = await getCurrentUser().then(async user => ({ user, room: await getRoom(slug, user?.id) })).catch(() => null);
  if (!context) {
    const championRoute = slug.startsWith("champ-");
    const from = searchReturn ?? (championRoute ? directoryReturn : undefined);
    const retry = new URL(withSearchReturn(roomFeedHref(slug, view.key), from), "https://room.invalid");
    if (search.view === "discussions") retry.searchParams.set("view", "discussions");
    if (search.compose === "1") retry.searchParams.set("compose", "1");
    return <section className="card" data-page-unavailable>
      <h1 className="page-title">Room temporarily unavailable</h1>
      <p role="status">The community room couldn’t load.</p>
      <div className={styles.actions}>
        <a className="btn small" href={`${retry.pathname}${retry.search}`}>Try again</a>
        <Link className="btn small secondary" href={from ?? (championRoute ? "/champions" : "/rooms")} prefetch={false}>
          {searchReturn ? "Back to search" : championRoute ? "Back to champions" : "Back to rooms"}
        </Link>
      </div>
    </section>;
  }
  const { user, room } = context;
  if (!room) notFound();
  const viewerId = user?.id ?? null;
  const viewerIdentity = publicAvatarIdentity(user);
  const championSection = room.championId ? championRoomSection(search.view, view.key) : null;
  const from = searchReturn ?? (room.championId ? directoryReturn : undefined);
  const destination = championSection ? championRoomHref(room.slug, championSection, from, view.key)
    : withSearchReturn(roomFeedHref(room.slug, view.key), from);
  const shareDestination = championSection ? championRoomHref(room.slug, championSection, undefined, view.key)
    : roomFeedHref(room.slug, view.key);
  const composeUrl = new URL(destination, "https://room.invalid");
  composeUrl.searchParams.set("compose", "1");
  const composeHref = `${composeUrl.pathname}${composeUrl.search}#compose`;
  const allThreads = championSection ? championRoomHref(room.slug, "discussions", from)
    : withSearchReturn(roomFeedHref(room.slug, "all"), from);
  const roomBuilds = championSection === "builds" && room.championId ? room.championId : null;
  const [patch, champions, posts, sample] = await Promise.all([
    currentPatch(), championList(),
    (roomBuilds ? buildFeed(user, { champion: roomBuilds }, 12)
      : readRoomFeed(room.id, viewerId, view, championSection === "overview" ? 4 : undefined)).catch(() => null),
    room.championId && championSection === "overview" ? championRoomPulse(room.championId, viewerId).catch(() => null) : null,
  ]);
  const champInfo = room.championId ? champions.find(c => c.id === room.championId) : null;
  const roomTitle = champInfo ? `${champInfo.name} Mains` : room.name;

  return (
    <div>
      {user?.pilotActive && <PilotVisit kind="social"/>}
      {(from || room.championId) && <Link className={styles.back} href={from ?? "/champions"} prefetch={false}>
        <span aria-hidden="true">←</span> {searchReturn ? "Back to search" : "Back to champions"}
      </Link>}
      <RoomBanner slug={room.slug} championId={room.championId}/>

      <header className={styles.header}>
        <div className={styles.byline}>
          {room.championId && <ChampionPortrait id={room.championId} patch={patch} size={44} compact />}
          <div>
            <h1>{roomTitle}</h1>
            <span className="meta">
              {room.members} member{room.members === 1 ? "" : "s"}
              {champInfo && <> · {champInfo.title}</>}
            </span>
          </div>
        </div>
        <div className={styles.actions}>
          {user ? <JoinButton roomId={room.id} initial={room.joined} /> : <Link href={signInHref(destination)} className="btn small">Sign in to join</Link>}
          {room.slug === "lfg-lobby" && <Link href="/lfg" className="btn small secondary">Open Duo Finder</Link>}
          <ShareLink path={shareDestination} kind="room" />
          <SafetyReport kind="room" targetId={room.id} />
        </div>
        {room.raidUntil && <p className="notice warn" role="status">Room protection is active until {new Date(room.raidUntil).toLocaleTimeString()}. Links are paused. Leave 15 seconds between posts and replies.</p>}
        <details className={styles.details}>
          <summary>About this room</summary>
          <p>{room.description}</p>
          {room.host && <p className="meta">Hosted by <Link href={`/u/${room.host.id}`}>{room.host.name}</Link></p>}
        </details>
      </header>

      {championSection && <ChampionRoomTabs slug={room.slug} section={championSection} from={from} />}
      {championSection === "overview" && room.championId &&
        <ChampionRoomOverview champion={champInfo ?? undefined} championId={room.championId} patch={patch} sample={sample} />}
      {championSection && <div className={styles.feedHeading}>
        <h2>{championSection === "overview" ? "Latest discussions" : championSection === "builds" ? "Community builds" : "Discussions"}</h2>
        {championSection === "overview" && <Link href={allThreads} prefetch={false}>View all discussions</Link>}
      </div>}
      {roomBuilds ? <>
        <p className="meta">Recent {champInfo?.name ?? roomBuilds} builds from across the community.</p>
        <div className={styles.hubLinks}>
          <BuildsLink id="compose" className="btn small" href={buildsHref({ champion: roomBuilds, compose: true, room: true, from })}>Share a build</BuildsLink>
          <BuildsLink href={buildsHref({ champion: roomBuilds })}>Explore all {champInfo?.name ?? roomBuilds} builds</BuildsLink>
        </div>
      </> : <details className={styles.compose} open={search.compose === "1"}>
        <summary>Post in {roomTitle}<span aria-hidden="true">＋</span></summary>
        {user
          ? <Composer key={user.id + ":" + room.id} viewerId={user.id} roomId={room.id} patch={patch} champions={champions.map(c => c.id)} viewerIdentity={viewerIdentity} />
          : <GuestPostDraft roomId={room.id} destination={composeHref} label={`Post in ${roomTitle}`}/>}
      </details>}
      {(!championSection || championSection === "discussions") && <nav className={styles.roomTabs} aria-label="Room feed filters">
        {roomFeeds.filter(({ key }) => !championSection || key !== "builds").map(({key, label}) => <Link key={key}
          href={championSection ? championRoomHref(room.slug, "discussions", from, key) : withSearchReturn(roomFeedHref(room.slug, key), from)} scroll={false}
          aria-current={key === view.key ? "page" : undefined}>{label}</Link>)}
      </nav>}
      {posts === null ? <p className="empty" role="status">{roomBuilds ? "Community builds" : "Room posts"} are temporarily unavailable. Refresh to try again.</p> : posts.length === 0
        ? <WardEmptyState text={roomBuilds ? "No community builds for this champion yet." : view.key === "all" ? "No threads in this room yet." : `No ${view.label.toLowerCase()} in this room yet.`}
            action={roomBuilds ? <BuildsLink href={buildsHref({ champion: roomBuilds, compose: true, room: true, from })}>Share the first build</BuildsLink>
              : view.key === "all" ? <Link href={composeHref} prefetch={false}>Start the first thread</Link>
              : <Link href={allThreads} scroll={false}>See all threads</Link>}/>
        : posts.map(p => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={viewerId} viewerIdentity={viewerIdentity}
          fromBuild={roomBuilds ? destination : undefined} />)}
    </div>
  );
}
