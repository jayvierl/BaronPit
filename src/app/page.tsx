import styles from "./home.module.css";
import { FollowingStarter } from "@/components/following-starter";
import { hasIncomingDuoRequest } from "@/lib/duo-activity";
import { Suspense } from "react";
import { CommunityObjective } from "@/components/community-objective";
import { TonightInThePit } from "@/components/tonight-in-the-pit";
import { tonightInThePit } from "@/lib/tonight-in-the-pit";
import { DailyCallHome } from "@/components/daily-call-home";
import { CommunityWelcome } from "@/components/community-welcome";
import { WardEmptyState } from "@/components/ward-mascot";
import { LobbyRally } from "@/components/lobby-rally";
import { CommunityReview } from "@/components/community-review";
import { hasUnreadReplies } from "@/lib/discussion-library";
import { PilotVisit } from "@/components/pilot-visit";
import { buildCatalog, cardItems } from "@/lib/build-catalog";
import { signInHref } from "@/lib/signin-return";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeComposer } from "@/components/home-composer";
import { HomeDiscoveryRail } from "@/components/home-discovery-rail";
import { LookupForm } from "@/components/social-ui";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { dbAvailable } from "@/lib/db";
import { joinedRoomIds, listFeaturedRooms } from "@/lib/rooms";
import { todaysSpotlight, dailyHighlight } from "@/lib/social";
import { homeFeedHref, readFeedCursor, type HomeFeedTab } from "@/lib/feed-pagination";
import { readHomeFeedPage } from "@/lib/post-reader";
import { currentPatch, championList } from "@/lib/riot";
import { PLATFORMS } from "@/lib/platforms";
import { MatchCard } from "@/components/match-card";
import { ChampionPortrait } from "@/components/champion-portrait";
import { PostCard } from "@/components/post-card";
import { socialRankLabel } from "@/lib/player-summary";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string; before?: string; summary?: string }> }) {
  const [params,user] = await Promise.all([searchParams,getCurrentUser()]);
  const activeTab: HomeFeedTab = params.tab === "following" ? "following" : "everyone";
  const now = new Date();
  const before = readFeedCursor(params.before, activeTab, now.getTime());
  const requestedSummary = params.summary === "tonight";
  const summaryParams = new URLSearchParams({ summary: "tonight" });
  if (activeTab === "following") summaryParams.set("tab", activeTab);
  if (before && params.before) summaryParams.set("before", params.before);
  const summaryHref = `/?${summaryParams}#tonight-in-the-pit-title`;
  if (activeTab === "following" && !user) redirect(signInHref(requestedSummary ? summaryHref : homeFeedHref(activeTab, before ? params.before : null)));
  const viewerIdentity = publicAvatarIdentity(user);
  const today = now.toISOString().slice(0, 10);
  const available = dbAvailable();
  const rooms = available ? listFeaturedRooms(user?.id).catch(() => []) : Promise.resolve([]);
  const interests = user && available ? joinedRoomIds(user.id).catch(() => []) : Promise.resolve([]);
  const [patch, page, champions, unread, duoInvite, tonight] = await Promise.all([
    currentPatch(),
    available ? readHomeFeedPage(user?.id ?? null, activeTab, before, now.getTime()).catch(() => null) : null,
    user ? championList() : [],
    user && available ? hasUnreadReplies(user.id).catch(() => false) : false,
    user && available ? hasIncomingDuoRequest(user.id).catch(() => false) : false,
    available && requestedSummary ? tonightInThePit(user?.id ?? null, now.getTime()).catch(() => null) : null,
  ]);
  return (
    <div className={`home-layout ${styles.home}`}>
      {user?.pilotActive && <PilotVisit kind="social"/>}
      <div className={styles.column}>
        <header className={styles.heading}>
          <nav className={styles.feeds} aria-label="Feed selection">
            {([
              ["everyone", "For you", "/?tab=everyone"],
              ["following", "Following", user ? "/?tab=following" : signInHref("/?tab=following")],
            ] as const).map(([value, label, href]) => activeTab === value
              ? <h1 key={value}><Link aria-current="page" href={href}>{label}</Link></h1>
              : <Link key={value} href={href}>{label}</Link>)}
          </nav>
          <Link className={styles.statsShortcut} href="/player" prefetch={false}>Player Stats</Link>
          {!user && <Link className={styles.signUp} href={signInHref("/#compose", "signup")}>Create account</Link>}
          <details className={styles.discover}>
            <summary aria-label="Discover"><span className={styles.magnifier} aria-hidden="true" /><span>Discover</span></summary>
            <div className={styles.discoverContent} id="home-discover" tabIndex={-1}>
              <form action="/search" method="get" role="search" aria-label="Community search" className={styles.search}>
                <input type="search" name="q" enterKeyHint="search" aria-label="Search the community" placeholder="Search players, champions or posts" maxLength={80} required />
                <button type="submit" aria-label="Search"><span className={styles.magnifier} aria-hidden="true" /></button>
              </form>
              <HomeDiscoveryRail asOf={now.getTime()} activeTab={activeTab} posts={page?.posts ?? []} roomsRead={rooms} interestsRead={interests} patch={patch} viewerId={user?.id ?? null}/>
            </div>
          </details>
        </header>
        <section id="home-feed" tabIndex={-1} className={styles.feed} aria-label="Conversations">
          <HomeComposer viewerId={user?.id ?? null} patch={patch} champions={champions.map(c => c.id)} viewerIdentity={viewerIdentity}/>
          {(unread || duoInvite) && <nav className={styles.activity} aria-label="New activity">
            {unread && <Link href="/activity">New replies</Link>}
            {duoInvite && <Link href="/activity?tab=duos">New duo request</Link>}
          </nav>}
          <HomeTimeline user={user} activeTab={activeTab} patch={patch} rooms={rooms} page={page} older={!!before} />
        </section>
      </div>

      <div className={styles.community}>
        <details open={requestedSummary}>
          <summary>Around the community</summary>
          <nav className={styles.destinations} aria-label="Community shortcuts">
            <Link href="/questions">Match questions</Link><Link href="/rooms">Rooms</Link><Link href="/player" prefetch={false}>Player Stats</Link>
            {available && !requestedSummary && <Link href={summaryHref} prefetch={false}>Tonight in the pit</Link>}
          </nav>
          {activeTab === "everyone" && <>
            <Suspense fallback={null}><CommunityReview viewerId={user?.id ?? null}/></Suspense>
            {available && <Suspense fallback={null}><CommunityObjective viewerId={user?.id ?? null}/></Suspense>}
            {available && <Suspense fallback={null}><DailyCallHome viewerId={user?.id ?? null}/></Suspense>}
          </>}
          {available && requestedSummary && <TonightInThePit summary={tonight} now={now.getTime()}/>}
          {available && <Suspense fallback={null}><HomeSpotlight today={today} viewerId={user?.id ?? null} patch={patch}/></Suspense>}
          <details className="community-lookup">
            <summary>Look up a player</summary>
            <LookupForm platforms={PLATFORMS.map(({id,label}) => ({id,label}))}/>
          </details>
          <LobbyRally />
        </details>
        {!user && <CommunityWelcome/>}
      </div>
    </div>
  );
}

async function HomeTimeline({ user, activeTab, patch, rooms, page, older }: {
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  activeTab: HomeFeedTab;
  patch: string;
  rooms: ReturnType<typeof listFeaturedRooms>;
  page: Awaited<ReturnType<typeof readHomeFeedPage>> | null;
  older: boolean;
}) {
  const posts = page?.posts ?? null;
  const viewerIdentity = publicAvatarIdentity(user);
  function renderPost(post: NonNullable<typeof posts>[number]) {
    return <PostCard key={post.id} post={post} patch={patch} signedIn={!!user}
      viewerId={user?.id ?? null} viewerIdentity={viewerIdentity} />;
  }

  return <>
    {posts === null ? (
      <div className="empty" role="status">The feed is temporarily unavailable. Refresh to try again.</div>
    ) : posts.length === 0 ? (
      older ? <p className="empty">You’ve reached the end of this feed.</p> :
      activeTab === "following" && user ? <FollowingStarter userId={user.id} rooms={await rooms}/> :
        <WardEmptyState text="Start the first conversation." action={<Link href="/questions/new">Ask a match question</Link>}/>
    ) : posts.map(renderPost)}
    {(older || page?.next) && <nav className={styles.pages} aria-label="Feed pages">
      {older && <Link prefetch={false} href={`${homeFeedHref(activeTab)}#home-feed`}>Back to latest posts</Link>}
      {page?.next && <Link prefetch={false} href={`${homeFeedHref(activeTab, page.next)}#home-feed`}>Older posts</Link>}
    </nav>}
  </>;
}

async function HomeSpotlight({ today, viewerId, patch }: { today: string; viewerId: number | null; patch: string }) {
  const spotlight = await todaysSpotlight(today, viewerId).catch(() => null);
  if (!spotlight) return null;
  const spotlightGame = dailyHighlight(spotlight.player, today);
  if (!spotlightGame) return null;
  const spotlightItems = await buildCatalog(patch);
  return (
    <div className="spotlight">
      <div className="spot-label">Hand of Baron · community spotlight</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "9px 0 2px" }}>
        <ChampionPortrait compact id={spotlightGame.champion} patch={patch} size={48} />
        <div>
          <strong>{spotlight.player.gameName}#{spotlight.player.tagLine}</strong>
          <div className="meta">{socialRankLabel(spotlight.player, true)}</div>
        </div>
      </div>
      <MatchCard patch={patch} itemPatch={spotlightItems?.patch} itemDetails={spotlightItems ? cardItems(spotlightItems,spotlightGame.items) : []} data={{ platform: spotlight.player.platform, matchId: spotlightGame.matchId, riotId: `${spotlight.player.gameName}#${spotlight.player.tagLine}`, match: spotlightGame }} />
      {spotlight.ownerId && (
        <p style={{ margin: "10px 0 0", fontSize: 14.5 }}>
          <Link href={`/u/${spotlight.ownerId}`}>Verified player · {spotlight.ownerName}</Link>
        </p>
      )}
    </div>
  );
}
