import { ChampionPortrait } from "@/components/champion-portrait";
import { POST_TO_THE_PIT } from "@/lib/brand";
import Link from "next/link";
import { Suspense } from "react";
import { ProfileReplies } from "./profile-replies";
import { ProfileMatchDiscussions } from "./profile-match-discussions";
import { ShareLink } from "@/components/share-link";
import { RankBadge } from "@/components/rank-badge";
import { WinStreak } from "@/components/win-streak";
import { placedRank, socialRankLabel } from "@/lib/player-summary";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { currentPatch } from "@/lib/riot";
import { feedByAuthor, followCounts, isFollowing, endorsementCounts, dailyHighlight, ENDORSE_KINDS } from "@/lib/social";
import { earnedBadges } from "@/lib/pure";
import { linkedPlayers as readLinkedPlayers, publicProfile } from "@/lib/player-insights";
import { playerStatsHref } from "@/lib/platforms";
import { pageCursor } from "@/lib/discussion-library";
import { decisionCursor } from "@/lib/decisions-input";
import { profileMatchDiscussions } from "@/lib/decisions";
import { readSearchReturn, withSearchReturn } from "@/lib/search-scopes";
import { readProfileLink } from "@/lib/profile-featured-link";
import { validId } from "@/lib/ids";
import { signInHref } from "@/lib/signin-return";
import { Avatar } from "@/components/ui";
import { PlayerStats } from "@/components/player-stats";
import { PlayerOverview } from "@/components/player-overview";
import { EndorseRow, FollowButton, UserSafetyMenu } from "@/components/social-ui";
import { DuoPinButton } from "@/components/duo-shortlist";
import { pinnedDuoIds } from "@/lib/duo-shortlist";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { PostCard } from "@/components/post-card";
import { SafetyReport } from "@/components/safety-report";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

function ProfileUnavailable({ retryHref }: { retryHref: string }) {
  return <section className={styles.empty}>
    <h1>Profile temporarily unavailable</h1>
    <p>We couldn’t load this profile.</p>
    <a className="btn secondary" href={retryHref}>Try again</a>
  </section>;
}

export default async function ProfilePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; updated?: string; before?: string; from?: string }>;
}) {
  const [{id},{tab,updated,before,from}] = await Promise.all([params,searchParams]);
  const userId = Number(id);
  if (!/^\d+$/.test(id) || !validId(userId)) notFound();
  const activeTab = tab === "players" || tab === "stats" ? "stats" : tab === "replies" || tab === "discussions" ? tab : "posts";
  const searchReturn = readSearchReturn(from);
  const repliesCursor = activeTab === "replies" ? pageCursor(before) : null;
  const discussionsCursor = activeTab === "discussions" ? decisionCursor(before) : null;
  const profilePath = `/u/${userId}`;
  function tabHref(target: "posts" | "replies" | "stats" | "discussions", before?: string | number | null) {
    const path = target === "posts" ? profilePath : `${profilePath}?tab=${target}`;
    return withSearchReturn(before ? `${path}&before=${before}` : path, searchReturn);
  }
  const statsHref = tabHref("stats");
  const retryHref = tabHref(activeTab, repliesCursor ?? discussionsCursor);
  const viewer = await getCurrentUser().catch(() => undefined);
  if (viewer === undefined) return <ProfileUnavailable retryHref={retryHref} />;
  const today = new Date().toISOString().slice(0, 10);
  const profile = await publicProfile(userId, viewer?.id ?? null, today).catch(() => undefined);
  if (profile === undefined) return <ProfileUnavailable retryHref={retryHref} />;
  if (!profile) notFound();
  const content = await Promise.all([
    activeTab === "posts" ? currentPatch() : "", followCounts(userId), endorsementCounts(userId), readLinkedPlayers(userId),
    viewer && viewer.id !== userId ? isFollowing(viewer.id,userId) : false,
    activeTab === "posts" ? feedByAuthor(userId,viewer,20).catch(() => null) : [],
    profile.link ? readProfileLink(profile.link, viewer?.id ?? null) : null,
    viewer && viewer.id !== userId ? pinnedDuoIds(viewer.id, [userId]).catch(() => null) : null,
    activeTab === "discussions" ? profileMatchDiscussions(userId, viewer?.id ?? null, discussionsCursor).catch(() => null) : null,
  ]).catch(() => null);
  if (!content) return <ProfileUnavailable retryHref={retryHref} />;
  const [patch,counts,endorsements,linkedPlayers,following,posts,featuredLink,pins,discussions] = content;
  const player = linkedPlayers[0] ?? null;
  const badges = player?.verified ? earnedBadges(player.snapshot) : [];
  if (profile.featured && player?.verified) badges.unshift("Hand of Baron · featured today");
  const highlight = activeTab === "posts" && player?.verified ? dailyHighlight(player, today) : null;
  const lookupHref = player && withSearchReturn(playerStatsHref(player.platform, `${player.gameName}#${player.tagLine}`), searchReturn);
  const isSelf = viewer?.id === userId;

  return (
    <div>
      {searchReturn && <Link href={searchReturn} className={`${styles.link} ${styles.returnLink}`}>← Back to search</Link>}
      {isSelf && updated === "1" && <p className="notice ok" role="status">Profile updated.</p>}
      <header className={styles.identity}>
        <div className={styles.byline}>
          <div>
            <div className={styles.nameLine}>
              <h1 className="profile-name">{profile.name}</h1>
              <WinStreak wins={player?.winStreak}/>
            </div>
            {player && <p className={styles.riotId}>{player.gameName}#{player.tagLine}
              <span> · {player.verified ? "Verified Riot link" : "Unverified Riot link"}</span></p>}
            {player?.verified && activeTab === "replies" && <Link href={statsHref} className={styles.identityRank} scroll={false}>
              <RankBadge tier={placedRank(player).tier}>{socialRankLabel(player)}</RankBadge>
            </Link>}
            {!player && isSelf && activeTab === "replies" && <Link href="/me" className={styles.link}>Link a Riot ID</Link>}
          </div>
          <Avatar name={profile.name} hue={profile.hue} avatar={profile.avatar} size={76} />
        </div>
        {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
        {featuredLink && <Link className={styles.link} href={featuredLink.href}>{featuredLink.label} <span aria-hidden="true">↗</span></Link>}
        <p className={styles.socialProof}>
          <span>{counts.followers} follower{counts.followers === 1 ? "" : "s"}</span>
          <span>{counts.following} following</span>
          <span>Joined {new Date(profile.createdAt).toLocaleDateString("en-US", {month:"short", year:"numeric", timeZone:"UTC"})}</span>
        </p>
        <div className={styles.actions}>
          {isSelf ? <>
            <Link href="/profile/edit" className="btn secondary">Edit profile</Link>
            <Link href="/lfg#duo-plan" className="btn secondary">My duo preferences</Link>
          </> : viewer ? <FollowButton userId={userId} initial={following} />
            : <Link className="btn small" href={signInHref(tabHref(activeTab, repliesCursor ?? discussionsCursor))}>Sign in to follow</Link>}
          {pins && <DuoPinButton key={userId} playerId={userId} initial={pins.includes(userId)}/>}
          <ShareLink path={profilePath} kind="profile"/>
          {!isSelf && (viewer ? <UserSafetyMenu userId={userId}/> : <SafetyReport kind="user" targetId={userId}/>)}
        </div>
        {badges.length > 0 && <div className={styles.badges}>
          {badges.map(b => <span key={b} className="chip badge">{b}</span>)}
        </div>}
        {ENDORSE_KINDS.some(k => endorsements[k.id] > 0) && <div className={styles.endorsements}>
          <span>Teammate endorsements · last 90 days</span>
          {ENDORSE_KINDS.filter(k => endorsements[k.id] > 0).map(k => <span key={k.id} className="chip">{k.label} · {endorsements[k.id]}</span>)}
        </div>}
        {viewer && !isSelf && <details className={styles.endorse}>
          <summary>Endorse a teammate</summary>
          <EndorseRow userId={userId}/>
        </details>}
      </header>
      <nav aria-label="Profile sections" className="tabs">
        {([["posts","Posts"], ["replies","Replies"], ["discussions","Match discussions"], ["stats","Player stats"]] as const).map(([id,label]) =>
          <Link key={id} href={tabHref(id)}
            prefetch={false} scroll={false} aria-current={activeTab === id ? "page" : undefined} className={activeTab === id ? "active" : ""}>{label}</Link>)}
      </nav>

      {activeTab === "replies" && (
        <Suspense key={repliesCursor ?? ""} fallback={<p className={styles.empty} role="status">Loading replies…</p>}>
          <ProfileReplies authorId={userId} viewerId={viewer?.id ?? null} cursor={repliesCursor} searchReturn={searchReturn}/>
        </Suspense>
      )}
      {activeTab === "discussions" && <ProfileMatchDiscussions page={discussions} older={discussionsCursor !== null}
        latestHref={tabHref("discussions")} olderHref={discussions?.next ? tabHref("discussions", discussions.next) : undefined}
        searchReturn={searchReturn} isSelf={isSelf}/>}
      {activeTab === "stats" && (
        linkedPlayers.length ? linkedPlayers.map(p => {
          const href = withSearchReturn(playerStatsHref(p.platform, `${p.gameName}#${p.tagLine}`), searchReturn);
          return <section className={styles.account} key={p.puuid} aria-label={`${p.gameName}#${p.tagLine}`}>
            <h2>{p.gameName}#{p.tagLine}</h2>
            <p className="meta">{p.platform.toUpperCase()} · {p.verified ? "Verified Riot link" : "Unverified Riot link"}</p>
            {p.verified ? <PlayerStats player={p} lookupHref={`${href}#match-history`}/>
              : <Link className={styles.link} href={href}>View stats for {p.gameName}#{p.tagLine} →</Link>}
          </section>;
        }) : <div className={styles.empty}>
          <h2>{isSelf ? "Link your Riot ID to show player stats" : "No Riot account linked"}</h2>
          <Link className={styles.link} href={isSelf ? "/me" : withSearchReturn("/player", searchReturn)}>{isSelf ? "Link a Riot ID" : "Look up a Riot ID"}</Link>
        </div>
      )}
      {activeTab === "posts" && <>
        {player?.verified && lookupHref ? (
          <PlayerOverview player={player} statsPath={statsHref} historyPath={lookupHref} />
        ) : lookupHref && player ? (
          <p className={styles.lookupPrompt}><Link className={styles.link} href={lookupHref}>View stats for {player.gameName}#{player.tagLine} <span aria-hidden="true">→</span></Link></p>
        ) : (
          <p className={styles.lookupPrompt}>{isSelf ? null : <span>No Riot account linked · </span>}<Link className={styles.link} href={isSelf ? "/me" : withSearchReturn("/player", searchReturn)}>{isSelf ? "Link a Riot ID" : "Look up a player"}</Link></p>
        )}
        {highlight && player && (
          <div className="highlight-row">
            <ChampionPortrait id={highlight.champion} patch={patch} size={46} compact />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "var(--accent-ink)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Today’s highlight
              </div>
              <div style={{ fontSize: 15 }}>
                <strong>{highlight.champion}</strong> —{" "}
                <span className={highlight.win ? "win" : "loss"}>{highlight.win ? "Victory" : "Defeat"}</span>{" "}
                · <span className="kda">{highlight.kills} / {highlight.deaths} / {highlight.assists}</span>
                <span className="meta"> · {highlight.cs} CS</span>
              </div>
              <div className="meta">Selected daily from recent games.</div>
            </div>
          </div>
        )}

        {posts === null ? (
          <div className="empty">This player’s posts are temporarily unavailable.</div>
        ) : posts.length === 0 ? (
          <div className={styles.empty}>
            <h2>{isSelf ? "Start your first thread" : "No posts yet"}</h2>
            <Link className={styles.link} href={isSelf ? "/#compose" : "/rooms"}>{isSelf ? POST_TO_THE_PIT : "Browse community rooms"} →</Link>
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(viewer)} viewerId={viewer?.id ?? null} viewerIdentity={publicAvatarIdentity(viewer)} />)
        )}
      </>}
    </div>
  );
}
