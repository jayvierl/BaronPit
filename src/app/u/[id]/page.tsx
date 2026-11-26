import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { currentPatch, championIconUrl } from "@/lib/riot";
import { feedByAuthor, followCounts, isFollowing, endorsementCounts, dailyHighlight, ENDORSE_KINDS } from "@/lib/social";
import { gameCount, earnedBadges } from "@/lib/pure";
import { linkedPlayers as readLinkedPlayers, publicProfile } from "@/lib/player-insights";
import { signInHref } from "@/lib/signin-return";
import { Avatar, rankLabel } from "@/components/ui";
import { EndorseRow, FollowButton, UserSafetyMenu } from "@/components/social-ui";
import { PostCard } from "@/components/post-card";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{id},{tab},viewer] = await Promise.all([params,searchParams,getCurrentUser()]);
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId <= 0 || userId > 2147483647) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const profile = await publicProfile(userId, viewer?.id ?? null, today);
  if (!profile) notFound();
  const [patch,counts,endorsements,linkedPlayers,following,posts] = await Promise.all([
    currentPatch(), followCounts(userId), endorsementCounts(userId), readLinkedPlayers(userId),
    viewer && viewer.id !== userId ? isFollowing(viewer.id,userId) : false,
    feedByAuthor(userId,viewer,20).catch(() => null),
  ]);
  const player = linkedPlayers[0] ?? null;
  const badges = player?.verified ? earnedBadges(player.snapshot) : [];
  if (profile.featured && player?.verified) badges.unshift("Hand of Baron · featured today");
  const highlight = player ? dailyHighlight(player, today) : null;
  const isSelf = viewer?.id === userId;
  const activeTab = tab === "players" && linkedPlayers.length > 0 ? "players" : "posts";

  return (
    <div>
      <div style={{ padding: "6px 2px 0" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="profile-name">{profile.name}</h1>
            <div style={{ fontSize: 14.5, marginTop: 2 }}>
              {player ? (
                <>{player.gameName}#{player.tagLine} · {player.verified ? "Verified Riot link" : "Unverified Riot link"}{player.verified && <> · <span className="flair">{player.flair}</span></>}</>
              ) : (
                <span className="meta">No Riot ID linked yet</span>
              )}
            </div>
            {badges.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {badges.map((b) => <span key={b} className="chip badge">{b}</span>)}
              </div>
            )}
          </div>
          <Avatar name={profile.name} hue={profile.hue} size={84} />
        </div>

        {profile.bio && <p style={{ margin: "12px 0 0", fontSize: 15 }}>{profile.bio}</p>}

        <div className="meta" style={{ marginTop: 10, fontSize: 14 }}>
          {counts.followers} follower{counts.followers === 1 ? "" : "s"} · {counts.following} following · joined{" "}
          {new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {ENDORSE_KINDS.map((k) => (
            <span key={k.id} className="chip">{k.label}: {endorsements[k.id] ?? 0}</span>
          ))}
        </div>

        {!viewer && <div className="profile-actions"><Link className="btn small" href={signInHref(`/u/${userId}`)}>Sign in to follow</Link></div>}
        {(viewer || isSelf) && (
          <div className="profile-actions">
            {isSelf && <><Link href="/me" className="btn secondary">Edit profile</Link><Link href="/lfg" className="btn secondary">My duo preferences</Link></>}
            {viewer && !isSelf && <FollowButton userId={userId} initial={following} />}
          </div>
        )}
        {viewer && !isSelf && (
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <UserSafetyMenu userId={userId} />
          </div>
        )}
        {viewer && !isSelf && (
          <div style={{ marginTop: 12 }}>
            <div className="meta" style={{ marginBottom: 6 }}>Endorse {profile.name.split(" ")[0]}</div>
            <EndorseRow userId={userId} />
          </div>
        )}
      </div>

      {highlight && player && (
        <div className="highlight-row">
          <Image unoptimized width={18} height={18} src={championIconUrl(patch, highlight.champion)} alt="" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--accent-ink)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {player.verified ? "Today’s highlight" : `Recent game from ${player.gameName}#${player.tagLine}`}
            </div>
            <div style={{ fontSize: 15 }}>
              <strong>{highlight.champion}</strong> —{" "}
              <span className={highlight.win ? "win" : "loss"}>{highlight.win ? "Victory" : "Defeat"}</span>{" "}
              · <span className="kda">{highlight.kills} / {highlight.deaths} / {highlight.assists}</span>
              <span className="meta"> · {highlight.cs} CS</span>
            </div>
            <div className="meta">{player.verified ? "Selected daily from recent games." : "This Riot account was linked without ownership verification."}</div>
          </div>
        </div>
      )}

      <div className="tabs" style={{ marginTop: 6 }}>
        <Link href={`/u/${userId}`} className={activeTab === "posts" ? "active" : ""}>Posts</Link>
        {linkedPlayers.length > 0 && (
          <Link href={`/u/${userId}?tab=players`} className={activeTab === "players" ? "active" : ""}>Players</Link>
        )}
      </div>

      {activeTab === "players" ? (
        <div>
          {linkedPlayers.map((p) => (
            <div key={p.puuid} className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/player?platform=${p.platform}&riotId=${encodeURIComponent(`${p.gameName}#${p.tagLine}`)}`} style={{ fontWeight: 600 }}>
                  {p.gameName}#{p.tagLine}
                </Link>
                <div className="meta">
                  {p.verified ? "Verified Riot link" : "Unverified Riot link"} · {rankLabel(p.rankTier, p.rankDiv, p.rankLp)} · last {gameCount(p.snapshot.games)}: {p.snapshot.wins}W–{p.snapshot.losses}L
                </div>
              </div>
              {p.snapshot.champPool[0] && <span className="chip">Main: {p.snapshot.champPool[0].champion}</span>}
            </div>
          ))}
        </div>
      ) : posts === null ? (
        <div className="empty">This player’s posts are temporarily unavailable.</div>
      ) : posts.length === 0 ? (
        <div className="empty">No posts yet.</div>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(viewer)} viewerId={viewer?.id ?? null} />)
      )}
    </div>
  );
}
