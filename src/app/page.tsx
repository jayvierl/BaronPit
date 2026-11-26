import styles from "./home.module.css";
import { FollowingStarter } from "@/components/following-starter";
import { hasIncomingDuoRequest } from "@/lib/duo-activity";
import { Suspense } from "react";
import { CommunityObjective } from "@/components/community-objective";
import { CommunityWelcome } from "@/components/community-welcome";
import { LobbyRally } from "@/components/lobby-rally";
import { CommunityReview } from "@/components/community-review";
import { duoEnabled } from "@/lib/duo";
import { gameCount } from "@/lib/pure";
import { hasUnreadReplies } from "@/lib/discussion-library";
import { PilotVisit } from "@/components/pilot-visit";
import { buildCatalog, cardItems } from "@/lib/build-catalog";
import { signInHref } from "@/lib/signin-return";
import { GuestPostDraft } from "@/components/guest-draft";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { dbAvailable } from "@/lib/db";
import { trendingChampions } from "@/lib/player-insights";
import { listFeaturedRooms } from "@/lib/rooms";
import { feed, todaysSpotlight, dailyHighlight } from "@/lib/social";
import { currentPatch, championList } from "@/lib/riot";
import { PLATFORMS } from "@/lib/platforms";
import { JoinButton, LookupForm } from "@/components/social-ui";
import { Composer } from "@/components/composer";
import { MatchCard } from "@/components/match-card";
import { ChampionPortrait } from "@/components/champion-portrait";
import { PostCard } from "@/components/post-card";
import { socialRankLabel } from "@/lib/player-summary";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{tab},user] = await Promise.all([searchParams,getCurrentUser()]);
  const viewerIdentity = publicAvatarIdentity(user);
  const activeTab = tab === "following" && user ? "following" : "everyone";
  const today = new Date().toISOString().slice(0, 10);
  const available = dbAvailable();
  const rooms = available ? listFeaturedRooms(user?.id).catch(() => []) : Promise.resolve([]);
  const trending = available ? trendingChampions().catch(() => []) : Promise.resolve([]);
  const [patch, posts, champions, unread, duoInvite] = await Promise.all([
    currentPatch(),
    available ? feed(user,activeTab).catch(() => null) : null,
    user ? championList() : [],
    user && available ? hasUnreadReplies(user.id).catch(() => false) : false,
    user && available ? hasIncomingDuoRequest(user.id).catch(() => false) : false,
  ]);
  return (
    <div>
      {user?.pilotActive && <PilotVisit kind="social"/>}
      <header className={styles.heading}>
        <h1>Home</h1>
        <div className={styles.headingLinks}>
          <Link href="/lfg">Find a duo</Link>
          {user ? <Link href="/rooms">Browse rooms</Link> : <Link className={styles.signup} href={signInHref("/#compose","signup")}>Create account</Link>}
        </div>
      </header>
      <nav className="tabs" aria-label="Feed selection">
        <Link href="/?tab=everyone" aria-current={activeTab === "everyone" ? "page" : undefined} className={activeTab === "everyone" ? "active" : ""}>Everyone</Link>
        <Link href={user ? "/?tab=following" : signInHref("/?tab=following")} aria-current={activeTab === "following" ? "page" : undefined} className={activeTab === "following" ? "active" : ""}>Following</Link>
      </nav>
      {(unread || duoInvite) && <div className={styles.activity} aria-label="New activity">
        {unread && <Link href="/activity">New replies</Link>}
        {duoInvite && <Link href="/activity?tab=duos">New duo request</Link>}
      </div>}

      {user ? (
        <Composer key={user.id} viewerId={user.id} patch={patch} champions={champions.map((c) => c.id)} viewerIdentity={viewerIdentity} />
      ) : (
        <details className={styles.draft}>
          <summary>Start a conversation <span aria-hidden="true">＋</span></summary>
          <GuestPostDraft destination="/#compose" label="Your post"/>
        </details>
      )}

      <HomeTimeline user={user} activeTab={activeTab} patch={patch} rooms={rooms} posts={posts} />
      <nav className={styles.destinations} aria-label="Community shortcuts">
        <Link href="/questions">Match questions</Link><Link href="/rooms">Rooms</Link><Link href="/player">Player lookup</Link>
      </nav>
      {activeTab === "everyone" && <>
        <Suspense fallback={null}><CommunityReview viewerId={user?.id ?? null} /></Suspense>
        {available && <Suspense fallback={null}><CommunityObjective viewerId={user?.id ?? null} /></Suspense>}
      </>}

      {available && <Suspense fallback={null}><HomeSpotlight today={today} viewerId={user?.id ?? null} patch={patch}/></Suspense>}

      <Suspense fallback={null}>
        <HomeDiscovery roomsRead={rooms} trendsRead={trending} patch={patch} signedIn={!!user} />
      </Suspense>
      <details className="community-lookup">
        <summary>Look up a player</summary>
        <LookupForm platforms={PLATFORMS.map(({id,label}) => ({id,label}))}/>
      </details>
      <LobbyRally />
      {!user && <CommunityWelcome/>}

    </div>
  );
}

async function HomeDiscovery({ roomsRead, trendsRead, patch, signedIn }: {
  roomsRead: ReturnType<typeof listFeaturedRooms>;
  trendsRead: ReturnType<typeof trendingChampions>;
  patch: string;
  signedIn: boolean;
}) {
  const [rooms, trending] = await Promise.all([roomsRead, trendsRead]);
  return <>
      {rooms.length > 0 && (
        <>
          <h2 className="section">Featured rooms</h2>
          <div>
            {rooms.map((r) => (
              <div key={r.id} className="list-row">
                <span style={{ display: "inline-flex", gap: 9, alignItems: "center" }}>
                  {r.championId && <ChampionPortrait compact id={r.championId} patch={patch} size={26} />}
                  <span>
                    <Link href={`/rooms/${r.slug}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                    <span className="meta">{r.host ? <> · Hosted by <Link href={`/u/${r.host.id}`}>{r.host.name}</Link></> : <> · {r.members} member{r.members === 1 ? "" : "s"}</>}</span>
                  </span>
                </span>
                {signedIn && <JoinButton roomId={r.id} initial={r.joined} />}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 14.5 }}><Link href="/rooms">Find a room</Link></p>
        </>
      )}

      {trending.length > 0 && (
        <>
          <h2 className="section">Popular in recent champion pools</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingBottom: 8 }}>
            {trending.map((t) => (
              <Link key={t.champion} href={`/rooms/champ-${t.champion.toLowerCase()}`} className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <ChampionPortrait compact id={t.champion} patch={patch} size={18} />
                {t.champion} · {gameCount(t.games)}
              </Link>
            ))}
          </div>
        </>
      )}

  </>;
}

async function HomeTimeline({ user, activeTab, patch, rooms, posts }: {
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  activeTab: "following" | "everyone";
  patch: string;
  rooms: ReturnType<typeof listFeaturedRooms>;
  posts: Awaited<ReturnType<typeof feed>> | null;
}) {
  const viewerIdentity = publicAvatarIdentity(user);
  const matching = duoEnabled();
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
    ) : posts.slice(0, 3).map(renderPost)}
    <section className={styles.duo} aria-labelledby="duo-invite-title">
      <Image unoptimized src="/baron-duo.webp" alt="" width={72} height={60} className={styles.duoArt} />
      <div><h2 id="duo-invite-title">Find your duo</h2>
        <p>{matching ? "Find a partner who plays your hours and needs your role." : "Save your role and play times for verified matching."}</p>
        <Link href="/lfg">{matching ? "Browse duos" : "Set duo preferences"} <span aria-hidden="true">→</span></Link>
      </div>
    </section>
    {posts?.slice(3).map(renderPost)}
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
