import { ChampionPortrait } from "@/components/champion-portrait";
import Link from "next/link";
import { Suspense } from "react";
import { ProfileReplies } from "./profile-replies";
import { ShareLink } from "@/components/share-link";
import { RankBadge } from "@/components/rank-badge";
import { placedRank, socialRankLabel } from "@/lib/player-summary";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { currentPatch } from "@/lib/riot";
import { feedByAuthor, followCounts, isFollowing, endorsementCounts, dailyHighlight, ENDORSE_KINDS } from "@/lib/social";
import { earnedBadges } from "@/lib/pure";
import { linkedPlayers as readLinkedPlayers, publicProfile } from "@/lib/player-insights";
import { playerStatsHref } from "@/lib/platforms";
import { readProfileLink } from "@/lib/profile-featured-link";
import { signInHref } from "@/lib/signin-return";
import { Avatar } from "@/components/ui";
import { PlayerStats } from "@/components/player-stats";
import { PlayerOverview } from "@/components/player-overview";
import { EndorseRow, FollowButton, UserSafetyMenu } from "@/components/social-ui";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { PostCard } from "@/components/post-card";
import { SafetyReport } from "@/components/safety-report";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; updated?: string; before?: string }>;
}) {
  const [{id},{tab,updated,before},viewer] = await Promise.all([params,searchParams,getCurrentUser()]);
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId <= 0 || userId > 2147483647) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const profile = await publicProfile(userId, viewer?.id ?? null, today);
  if (!profile) notFound();
  const activeTab = tab === "players" || tab === "stats" ? "stats" : tab === "replies" ? "replies" : "posts";
  const [patch,counts,endorsements,linkedPlayers,following,posts,featuredLink] = await Promise.all([
    activeTab === "posts" ? currentPatch() : "", followCounts(userId), endorsementCounts(userId), readLinkedPlayers(userId),
    viewer && viewer.id !== userId ? isFollowing(viewer.id,userId) : false,
    activeTab === "posts" ? feedByAuthor(userId,viewer,20).catch(() => null) : [],
    profile.link ? readProfileLink(profile.link, viewer?.id ?? null) : null,
  ]);
  const player = linkedPlayers[0] ?? null;
  const badges = player?.verified ? earnedBadges(player.snapshot) : [];
  if (profile.featured && player?.verified) badges.unshift("Hand of Baron · featured today");
  const highlight = activeTab === "posts" && player?.verified ? dailyHighlight(player, today) : null;
  const lookupHref = player && playerStatsHref(player.platform, `${player.gameName}#${player.tagLine}`);
  const isSelf = viewer?.id === userId;

  return (
    <div>
      {isSelf && updated === "1" && <p className="notice ok" role="status">Profile updated.</p>}
      <header className={styles.identity}>
        <div className={styles.byline}>
          <div>
            <h1 className="profile-name">{profile.name}</h1>
            {player && <p className={styles.riotId}>{player.gameName}#{player.tagLine}
              <span> · {player.verified ? "Verified Riot link" : "Unverified Riot link"}</span></p>}
            {player?.verified && activeTab !== "posts" && <Link href={`/u/${userId}?tab=stats`} className={styles.identityRank}>
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
            <Link href="/lfg" className="btn secondary">My duo preferences</Link>
          </> : viewer ? <FollowButton userId={userId} initial={following} />
            : <Link className="btn small" href={signInHref(`/u/${userId}`)}>Sign in to follow</Link>}
          <ShareLink path={`/u/${userId}`} kind="profile"/>
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
        {([["posts","Posts"], ["replies","Replies"], ["stats","Player stats"]] as const).map(([id,label]) =>
          <Link key={id} href={id === "posts" ? `/u/${userId}` : `/u/${userId}?tab=${id}`}
            prefetch={false} scroll={false} aria-current={activeTab === id ? "page" : undefined} className={activeTab === id ? "active" : ""}>{label}</Link>)}
      </nav>

      {activeTab === "replies" && (
        <Suspense key={before ?? ""} fallback={<p className={styles.empty} role="status">Loading replies…</p>}>
          <ProfileReplies authorId={userId} viewerId={viewer?.id ?? null} before={before}/>
        </Suspense>
      )}
      {activeTab === "stats" && (
        linkedPlayers.length ? linkedPlayers.map(p => {
          const href = playerStatsHref(p.platform, `${p.gameName}#${p.tagLine}`);
          return <section className={styles.account} key={p.puuid} aria-label={`${p.gameName}#${p.tagLine}`}>
            <h2>{p.gameName}#{p.tagLine}</h2>
            <p className="meta">{p.platform.toUpperCase()} · {p.verified ? "Verified Riot link" : "Unverified Riot link"}</p>
            {p.verified ? <PlayerStats player={p} lookupHref={href}/>
              : <Link className={styles.link} href={href}>View stats for {p.gameName}#{p.tagLine} →</Link>}
          </section>;
        }) : <div className={styles.empty}>
          <h2>{isSelf ? "Link your Riot ID to show player stats" : "No Riot account linked"}</h2>
          <Link className={styles.link} href={isSelf ? "/me" : "/player"}>{isSelf ? "Link a Riot ID" : "Look up a Riot ID"}</Link>
        </div>
      )}
      {activeTab === "posts" && <>
        {player?.verified && lookupHref ? (
          <PlayerOverview player={player} statsPath={`/u/${userId}?tab=stats`} historyPath={lookupHref} />
        ) : lookupHref && player ? (
          <p className={styles.lookupPrompt}><Link className={styles.link} href={lookupHref}>View stats for {player.gameName}#{player.tagLine} <span aria-hidden="true">→</span></Link></p>
        ) : (
          <p className={styles.lookupPrompt}>{isSelf ? null : <span>No Riot account linked · </span>}<Link className={styles.link} href={isSelf ? "/me" : "/player"}>{isSelf ? "Link a Riot ID" : "Look up a player"}</Link></p>
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
            <Link className={styles.link} href={isSelf ? "/#compose" : "/rooms"}>{isSelf ? "Write a post" : "Browse community rooms"} →</Link>
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(viewer)} viewerId={viewer?.id ?? null} viewerIdentity={publicAvatarIdentity(viewer)} />)
        )}
      </>}
    </div>
  );
}
