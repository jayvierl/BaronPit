import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { currentPatch, championIconUrl, playerFromRow } from "@/lib/riot";
import { feedByAuthor, followCounts, isFollowing, endorsementCounts, primaryPlayer, dailyHighlight, flairFor, todaysSpotlight, ENDORSE_KINDS } from "@/lib/social";
import { earnedBadges } from "@/lib/pure";
import { Avatar, rankLabel } from "@/components/ui";
import { EndorseRow, FollowButton, PostCard, UserSafetyMenu } from "@/components/social-ui";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const userId = Number(id);
  if (!userId) notFound();
  const rows = await q`SELECT * FROM wp_users WHERE id = ${userId} LIMIT 1`.catch(() => []);
  if (!rows.length) notFound();
  const profile = {
    id: userId,
    name: String(rows[0].display_name),
    hue: Number(rows[0].avatar_hue),
    bio: String(rows[0].bio ?? ""),
    createdAt: String(rows[0].created_at),
  };
  const viewer = await getCurrentUser().catch(() => null);
  // Independent loads in parallel; linked players are mapped straight from the
  // JOIN rows — no per-player re-fetch (audit D3/D5).
  const [patch, counts, endorsements, player, linkRows, posts] = await Promise.all([
    currentPatch(),
    followCounts(userId),
    endorsementCounts(userId),
    primaryPlayer(userId),
    q`SELECT p.* FROM wp_links l JOIN wp_players p ON p.puuid = l.puuid WHERE l.user_id = ${userId} ORDER BY l.is_primary DESC`.catch(() => []),
    feedByAuthor(userId, viewer, 20).catch(() => []),
  ]);
  const following = viewer && viewer.id !== userId ? await isFollowing(viewer.id, userId) : false;
  const spotlightToday = await todaysSpotlight(new Date().toISOString().slice(0, 10)).catch(() => null);
  const holdsBuff = spotlightToday?.ownerId === userId;
  const linkedPlayers = linkRows.map((r) => playerFromRow(r));
  const today = new Date().toISOString().slice(0, 10);
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
                <>{player.gameName}#{player.tagLine} · <span className="flair">{flairFor(player)}</span></>
              ) : (
                <span className="meta">No Riot ID linked yet</span>
              )}
            </div>
            {(holdsBuff || (player && earnedBadges(player.snapshot).length > 0)) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {holdsBuff && <span className="chip badge">🟣 Hand of Baron — holding the buff today</span>}
                {player && earnedBadges(player.snapshot).map((b) => <span key={b} className="chip badge">{b}</span>)}
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

        {(viewer || isSelf) && (
          <div className="profile-actions">
            {isSelf && <Link href="/me" className="btn secondary">Edit profile</Link>}
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
          <img src={championIconUrl(patch, highlight.champion)} alt="" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--accent-ink)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Today&apos;s highlight
            </div>
            <div style={{ fontSize: 15 }}>
              <strong>{highlight.champion}</strong> —{" "}
              <span className={highlight.win ? "win" : "loss"}>{highlight.win ? "Victory" : "Defeat"}</span>{" "}
              · <span className="kda">{highlight.kills} / {highlight.deaths} / {highlight.assists}</span>
              <span className="meta"> · {highlight.cs} CS</span>
            </div>
            <div className="meta">Auto-built from recent games — a fresh one lands every day.</div>
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
                  {rankLabel(p.rankTier, p.rankDiv, p.rankLp)} · last {p.snapshot.games} games: {p.snapshot.wins}W–{p.snapshot.losses}L
                </div>
              </div>
              {p.snapshot.champPool[0] && <span className="chip">Main: {p.snapshot.champPool[0].champion}</span>}
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="empty">No posts yet.</div>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(viewer)} viewerId={viewer?.id ?? null} />)
      )}
    </div>
  );
}
