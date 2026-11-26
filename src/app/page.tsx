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
  const [patch, champions, posts, rooms, trending, unread] = await Promise.all([
    currentPatch(),
    user ? championList() : [],
    available ? feed(user,activeTab).catch(() => null) : null,
    available ? listFeaturedRooms(user?.id).catch(() => []) : [],
    available ? trendingChampions().catch(() => []) : [],
    user && available ? hasUnreadReplies(user.id).catch(() => false) : false,
  ]);
  function renderPost(post: NonNullable<typeof posts>[number]) {
    return <PostCard key={post.id} post={post} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} />;
  }

  return (
    <div>
      {user?.pilotActive && <PilotVisit kind="social"/>}
      <header className="lobby-header">
        <div className="community-heading">
          <h1 className="page-title">Community</h1>
          <Link href="/rooms" className="text-btn">Browse rooms</Link>
        </div>
        {!user && <CommunityWelcome />}
        <section className="duo-invite" aria-labelledby="duo-invite-title">
          <div>
            <h2 id="duo-invite-title">Find your duo</h2>
            <p>{duoEnabled() ? "Find someone who shares your hours, playstyle and plans for the next game." : "Save your role, usual play times and voice preference for when verified matching opens."}</p>
          </div>
          <Link className="btn gold" href="/lfg">{duoEnabled() ? "Open Duo Finder" : "Set duo preferences"}</Link>
        </section>
        <details className="community-lookup">
          <summary>Look up a player</summary>
          <LookupForm platforms={PLATFORMS.map(({id,label}) => ({id,label}))}/>
        </details>
      </header>
      {unread && <p className="notice"><Link href="/activity">New replies in discussions you watch</Link></p>}
      <nav className="tabs" aria-label="Feed selection">
        <Link href="/?tab=everyone" aria-current={activeTab === "everyone" ? "page" : undefined} className={activeTab === "everyone" ? "active" : ""}>Everyone</Link>
        {user
          ? <Link href="/?tab=following" aria-current={activeTab === "following" ? "page" : undefined} className={activeTab === "following" ? "active" : ""}>Following</Link>
          : <Link href={signInHref("/?tab=following")}>Following</Link>}
        <Link href="/questions">Match questions</Link>
      </nav>

      {user ? (
        <Composer patch={patch} champions={champions.map((c) => c.id)} userName={user.displayName} userHue={user.avatarHue} />
      ) : (
        <>
          <GuestPostDraft destination="/#compose" label="Join the discussion"/>
          <Link href={signInHref("/#compose","signup")} className="text-btn">Create your account</Link>
        </>
      )}

      <div>
        {posts === null ? (
          <div className="empty" role="status">The feed is temporarily unavailable. Refresh to try again.</div>
        ) : posts.length === 0 ? (
          <div className="empty">
            <p><strong style={{ color: "var(--ink)" }}>The floor is open.</strong></p>
            <p>Nothing here yet — the first posts set the tone. Look up a player, share a game card, or open a room and say hello.</p>
          </div>
        ) : (
          posts.slice(0, 1).map(renderPost)
        )}
      </div>

      {activeTab === "everyone" && <>
        <Suspense fallback={null}><CommunityReview viewerId={user?.id ?? null} /></Suspense>
        {available && <Suspense fallback={null}><CommunityObjective viewerId={user?.id ?? null} /></Suspense>}
      </>}
      {posts?.slice(1).map(renderPost)}

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

      <LobbyRally />
      <p className="meta" style={{ marginTop: 18 }}>
        Discuss the play respectfully and keep first contact in the app. <Link href="/guidelines">Community guidelines</Link>
      </p>
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
