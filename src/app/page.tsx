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
import { dbAvailable } from "@/lib/db";
import { trendingChampions } from "@/lib/player-insights";
import { listFeaturedRooms } from "@/lib/rooms";
import { feed, todaysSpotlight, dailyHighlight } from "@/lib/social";
import { currentPatch, championList, championIconUrl } from "@/lib/riot";
import { PLATFORMS } from "@/lib/platforms";
import { JoinButton, LookupForm } from "@/components/social-ui";
import { Composer } from "@/components/composer";
import { MatchCard } from "@/components/match-card";
import { PostCard } from "@/components/post-card";
import { rankLabel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{tab},user] = await Promise.all([searchParams,getCurrentUser()]);
  const activeTab = tab === "following" && user ? "following" : "everyone";
  const today = new Date().toISOString().slice(0, 10);
  const available = dbAvailable();
  const [patch, champions, posts, rooms, trending, unread, duoInvite] = await Promise.all([
    currentPatch(),
    user ? championList() : [],
    available ? feed(user,activeTab).catch(() => null) : null,
    available ? listFeaturedRooms(user?.id).catch(() => []) : [],
    available ? trendingChampions().catch(() => []) : [],
    user && available ? hasUnreadReplies(user.id).catch(() => false) : false,
    user && available ? hasIncomingDuoRequest(user.id).catch(() => false) : false,
  ]);
  function renderPost(post: NonNullable<typeof posts>[number]) {
    return <PostCard key={post.id} post={post} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} />;
  }

  return (
    <div>
      {user?.pilotActive && <PilotVisit kind="social"/>}
      <header className={styles.heading}>
        <h1>Home</h1>
        {user ? <Link href="/rooms">Browse rooms</Link> : <Link href={signInHref("/#compose","signup")}>Create account</Link>}
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
        <Composer patch={patch} champions={champions.map((c) => c.id)} userName={user.displayName} userHue={user.avatarHue} />
      ) : (
        <GuestPostDraft destination="/#compose" label="Start a conversation"/>
      )}

      <div>
        {posts === null ? (
          <div className="empty" role="status">The feed is temporarily unavailable. Refresh to try again.</div>
        ) : posts.length === 0 ? (
          activeTab === "following" && user
            ? <FollowingStarter userId={user.id} rooms={rooms}/>
            : <div className="empty"><p>Start the first conversation.</p><Link href="/questions/new">Ask a match question</Link></div>
        ) : (
          posts.slice(0, 1).map(renderPost)
        )}
      </div>

      <section className={styles.duo} aria-labelledby="duo-invite-title">
        <div><h2 id="duo-invite-title">Find your duo</h2>
          <p>{duoEnabled() ? "See who plays your hours and needs your role." : "Save your role and play times while verified matching is in the works."}</p>
        </div>
        <Link className="btn secondary small" href="/lfg">{duoEnabled() ? "Browse duos" : "Set duo preferences"}</Link>
      </section>
      {posts?.slice(1).map(renderPost)}
      <nav className={styles.destinations} aria-label="Community shortcuts">
        <Link href="/questions">Match questions</Link><Link href="/rooms">Rooms</Link><Link href="/player">Player lookup</Link>
      </nav>
      {activeTab === "everyone" && <>
        <Suspense fallback={null}><CommunityReview viewerId={user?.id ?? null} /></Suspense>
        {available && <Suspense fallback={null}><CommunityObjective viewerId={user?.id ?? null} /></Suspense>}
      </>}

      {available && <Suspense fallback={null}><HomeSpotlight today={today} viewerId={user?.id ?? null} patch={patch}/></Suspense>}

      {rooms.length > 0 && (
        <>
          <h2 className="section">Featured rooms</h2>
          <div>
            {rooms.map((r) => (
              <div key={r.id} className="list-row">
                <span style={{ display: "inline-flex", gap: 9, alignItems: "center" }}>
                  {r.championId && <Image unoptimized width={26} height={26} src={championIconUrl(patch, r.championId)} alt="" style={{ width: 26, height: 26, borderRadius: 7 }} />}
                  <span>
                    <Link href={`/rooms/${r.slug}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                    <span className="meta">{r.host ? <> · Hosted by <Link href={`/u/${r.host.id}`}>{r.host.name}</Link></> : <> · {r.members} member{r.members === 1 ? "" : "s"}</>}</span>
                  </span>
                </span>
                {user && <JoinButton roomId={r.id} initial={r.joined} />}
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
                <Image unoptimized width={18} height={18} src={championIconUrl(patch, t.champion)} alt="" style={{ width: 18, height: 18, borderRadius: 5 }} />
                {t.champion} · {gameCount(t.games)}
              </Link>
            ))}
          </div>
        </>
      )}

      <details className="community-lookup">
        <summary>Look up a player</summary>
        <LookupForm platforms={PLATFORMS.map(({id,label}) => ({id,label}))}/>
      </details>
      <LobbyRally />
      {!user && <CommunityWelcome/>}

    </div>
  );
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
        <Image unoptimized width={48} height={48} className="champ-icon" src={championIconUrl(patch, spotlightGame.champion)} alt="" />
        <div>
          <strong>{spotlight.player.gameName}#{spotlight.player.tagLine}</strong>
          <div className="meta">{rankLabel(spotlight.player.rankTier, spotlight.player.rankDiv, spotlight.player.rankLp)}</div>
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
