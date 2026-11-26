import styles from "./home.module.css";
import { FollowingStarter } from "@/components/following-starter";
import { hasIncomingDuoRequest } from "@/lib/duo-activity";
import { Suspense } from "react";
import { CommunityObjective } from "@/components/community-objective";
import { CommunityWelcome } from "@/components/community-welcome";
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
import { listFeaturedRooms } from "@/lib/rooms";
import { feed, todaysSpotlight, dailyHighlight } from "@/lib/social";
import { currentPatch, championList } from "@/lib/riot";
import { PLATFORMS } from "@/lib/platforms";
import { MatchCard } from "@/components/match-card";
import { ChampionPortrait } from "@/components/champion-portrait";
import { PostCard } from "@/components/post-card";
import { socialRankLabel } from "@/lib/player-summary";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{tab},user] = await Promise.all([searchParams,getCurrentUser()]);
  if (tab === "following" && !user) redirect(signInHref("/?tab=following"));
  const viewerIdentity = publicAvatarIdentity(user);
  const activeTab = tab === "following" && user ? "following" : "everyone";
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const available = dbAvailable();
  const rooms = available ? listFeaturedRooms(user?.id).catch(() => []) : Promise.resolve([]);
  const [patch, posts, champions, unread, duoInvite] = await Promise.all([
    currentPatch(),
    available ? feed(user,activeTab).catch(() => null) : null,
    user ? championList() : [],
    user && available ? hasUnreadReplies(user.id).catch(() => false) : false,
    user && available ? hasIncomingDuoRequest(user.id).catch(() => false) : false,
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
          <div className={styles.utilities}>
            <a className={styles.discoverLink} href="#home-discover">Discover</a>
            {!user && <Link className={styles.signUp} href={signInHref("/#compose", "signup")}>Create account</Link>}
          </div>
        </header>
        <section className={styles.feed} aria-label="Conversations">
          <HomeComposer viewerId={user?.id ?? null} patch={patch} champions={champions.map(c => c.id)} viewerIdentity={viewerIdentity}/>
          {(unread || duoInvite) && <nav className={styles.activity} aria-label="New activity">
            {unread && <Link href="/activity">New replies</Link>}
            {duoInvite && <Link href="/activity?tab=duos">New duo request</Link>}
          </nav>}
          <HomeTimeline user={user} activeTab={activeTab} patch={patch} rooms={rooms} posts={posts} />
        </section>
      </div>

      <div className={styles.discovery} id="home-discover" tabIndex={-1}>
        <HomeDiscoveryRail asOf={now.getTime()} activeTab={activeTab} posts={posts ?? []} roomsRead={rooms} patch={patch} viewerId={user?.id ?? null}/>
      </div>

      <div className={styles.community}>
        <details>
          <summary>Around the community</summary>
          <nav className={styles.destinations} aria-label="Community shortcuts">
            <Link href="/questions">Match questions</Link><Link href="/rooms">Rooms</Link><Link href="/player">Player lookup</Link>
          </nav>
          {activeTab === "everyone" && <>
            <Suspense fallback={null}><CommunityReview viewerId={user?.id ?? null}/></Suspense>
            {available && <Suspense fallback={null}><CommunityObjective viewerId={user?.id ?? null}/></Suspense>}
          </>}
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

async function HomeTimeline({ user, activeTab, patch, rooms, posts }: {
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  activeTab: "following" | "everyone";
  patch: string;
  rooms: ReturnType<typeof listFeaturedRooms>;
  posts: Awaited<ReturnType<typeof feed>> | null;
}) {
  const viewerIdentity = publicAvatarIdentity(user);
  function renderPost(post: NonNullable<typeof posts>[number]) {
    return <PostCard key={post.id} post={post} patch={patch} signedIn={!!user}
      viewerId={user?.id ?? null} viewerIdentity={viewerIdentity} />;
  }

  return <>
    {posts === null ? (
      <div className="empty" role="status">The feed is temporarily unavailable. Refresh to try again.</div>
    ) : posts.length === 0 ? (
      activeTab === "following" && user ? <FollowingStarter userId={user.id} rooms={await rooms}/> :
        <div className="empty"><p>Start the first conversation.</p><Link href="/questions/new">Ask a match question</Link></div>
    ) : posts.map(renderPost)}
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
      <MatchCard patch={patch} itemPatch={spotlightItems?.patch} itemDetails={spotlightItems ? cardItems(spotlightItems,spotlightGame.items) : []} data={{ puuid: spotlight.player.puuid, matchId: spotlightGame.matchId, riotId: `${spotlight.player.gameName}#${spotlight.player.tagLine}`, match: spotlightGame }} />
      {spotlight.ownerId && (
        <p style={{ margin: "10px 0 0", fontSize: 14.5 }}>
          <Link href={`/u/${spotlight.ownerId}`}>Verified player · {spotlight.ownerName}</Link>
        </p>
      )}
    </div>
  );
}
