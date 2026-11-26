import { PilotVisit } from "@/components/pilot-visit";
import { signInHref } from "@/lib/signin-return";
import { GuestPostDraft } from "@/components/guest-draft";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { championRoomPulse } from "@/lib/player-insights";
import { SafetyReport } from "@/components/safety-report";
import { feed, getRoom } from "@/lib/social";
import { currentPatch, championIconUrl, championList } from "@/lib/riot";
import { gameCount, splashUrl } from "@/lib/pure";
import { playerStatsHref, PLATFORMS } from "@/lib/platforms";
import { publicPatch } from "@/lib/patch-notes";
import { JoinButton } from "@/components/social-ui";
import { Composer } from "@/components/composer";
import { PostCard } from "@/components/post-card";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{slug},user] = await Promise.all([params,getCurrentUser()]);
  const viewerIdentity = publicAvatarIdentity(user);
  const [room,patch,champions] = await Promise.all([getRoom(slug,user?.id),currentPatch(),championList()]);
  if (!room) notFound();
  const [posts,brief] = await Promise.all([
    feed(user,"everyone",room.id).catch(() => null),
    room.championId ? championRoomPulse(room.championId).catch(() => null) : null,
  ]);
  const champInfo = room.championId ? champions.find((c) => c.id === room.championId) : null;

  return (
    <div>
      {user?.pilotActive && <PilotVisit kind="social"/>}
      {room.championId
        ? <Image unoptimized width={1215} height={717} className="room-banner" src={splashUrl(room.championId)} alt="" style={{ marginBottom: 14 }} />
        : room.slug === "general"
          ? <picture>
              <source media="(max-width: 480px)" srcSet="/baron-room-480.webp 1x, /baron-room-960.webp 2x" />
              <Image unoptimized width={960} height={536} className="room-banner room-banner-pit" src="/baron-room-960.webp" alt="" />
            </picture>
          : <div className="room-banner-broad" style={{ marginBottom: 14 }} />}
      <div style={{ padding: "6px 2px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {room.championId && <Image unoptimized width={64} height={64} src={championIconUrl(patch, room.championId)} alt="" style={{ width: 64, height: 64, borderRadius: 16, border: "1px solid var(--border)" }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: "-0.01em" }}>{room.name}</h1>
            <div className="meta">
              {room.members} member{room.members === 1 ? "" : "s"}
              {champInfo && <> · {champInfo.title} · {champInfo.tags.join(" / ")}</>}
            </div>
          </div>
        </div>
        {room.slug === "lfg-lobby" ? (
          <div>
            <p>Talk about playing together here. Manage partner preferences and private pairing requests in Duo Finder.</p>
            <Link href="/lfg" className="btn secondary">Open Duo Finder</Link>
          </div>
        ) : <p style={{ margin: "10px 0 0", fontSize: 15 }}>{room.description}</p>}
        {room.host && <p className="meta">Hosted by <Link href={`/u/${room.host.id}`}>{room.host.name}</Link></p>}
        {room.championId && <p className="meta">
          <Link href={`/questions?champion=${encodeURIComponent(room.championId)}`}>Browse {champInfo?.name || room.championId} questions</Link>
          {" · "}<Link href="/rooms/patch-meta">Discuss patch {publicPatch(patch) || patch}</Link>
        </p>}
        {room.raidUntil && <p className="notice warn" role="status">Room protection is active until {new Date(room.raidUntil).toLocaleTimeString()}. Links are paused. Leave 15 seconds between posts and replies.</p>}
        <div className="profile-actions">
          {user ? <JoinButton roomId={room.id} initial={room.joined} /> : <Link href={signInHref(`/rooms/${room.slug}`)} className="btn">Sign in to join</Link>}
          {user && <SafetyReport kind="room" targetId={room.id} />}
        </div>
      </div>

      {brief && (
        <div style={{ padding: "14px 2px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 15.5 }}>{room.championId} in the house — room pulse</h2>
          {brief.games === 0 ? (
            <p className="meta" style={{ margin: 0 }}>
              No {room.championId} games in the sampled champion pools yet. Be the first: <Link href="/player">look up a {room.championId} player</Link> and
              their games will show up here.
            </p>
          ) : (
            <>
              <div className="kv">
                <div><b>{brief.players}</b><span>Sampled players</span></div>
                <div><b>{brief.games}</b><span>Recent games</span></div>
                <div><b>{Math.round((brief.wins / Math.max(1, brief.games)) * 100)}%</b><span>Win rate</span></div>
              </div>
              {brief.topPlayers.map((p) => (
                <Link key={`${p.platform}/${p.name}#${p.tag}`} className="match-row" prefetch={false}
                  href={playerStatsHref(p.platform, p.name + "#" + p.tag)}>
                  <span style={{ flex: 1, minWidth: 0, color: "var(--ink)", overflowWrap: "anywhere" }}><strong>{p.name}#{p.tag}</strong>
                    <small className="meta" style={{ display: "block" }}>{PLATFORMS.find(region => region.id === p.platform)?.label ?? p.platform}</small></span>
                  <span className="meta">{gameCount(p.games)} · {p.wins}W–{p.games - p.wins}L</span>
                </Link>
              ))}
            </>
          )}
        </div>
      )}

      {user
        ? <Composer roomId={room.id} patch={patch} champions={champions.map((c) => c.id)} viewerIdentity={viewerIdentity} />
        : <GuestPostDraft roomId={room.id} destination={`/rooms/${room.slug}#compose`} label={`Post in ${room.name}`}/>}

      <div>
        {posts === null ? <div className="empty" role="status">Room posts are temporarily unavailable. Refresh to try again.</div> : posts.length === 0
          ? <div className="empty">No posts yet — start this room&apos;s first thread.</div>
          : posts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} viewerIdentity={viewerIdentity} />)}
      </div>
    </div>
  );
}
