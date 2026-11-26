import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { feed, getRoom, listRooms } from "@/lib/social";
import { currentPatch, championIconUrl, championList } from "@/lib/riot";
import { splashUrl } from "@/lib/pure";
import { Composer, JoinButton, PostCard } from "@/components/social-ui";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const room = await getRoom(slug).catch(() => null);
  if (!room) notFound();
  const user = await getCurrentUser().catch(() => null);
  // Everything after the room lookup is independent — run it in parallel.
  // The room pulse is aggregated in SQL over champPool (audit D3/D4).
  const [patch, champions, posts, allRooms, pulseRows] = await Promise.all([
    currentPatch(),
    championList(),
    feed(user, "everyone", room.id).catch(() => []),
    listRooms(user?.id).catch(() => []),
    room.championId
      ? q`SELECT p.game_name, p.tag_line, p.platform, (elem->>'games')::int AS games, (elem->>'wins')::int AS wins
          FROM wp_players p, jsonb_array_elements(p.snapshot->'champPool') AS elem
          WHERE elem->>'champion' = ${room.championId}
          ORDER BY games DESC`.catch(() => [])
      : Promise.resolve([]),
  ]);
  const joined = allRooms.find((r) => r.id === room.id)?.joined ?? false;

  // Auto-brief: a champion room is never empty — it opens with live community form.
  let brief: { players: number; games: number; wins: number; topPlayers: { name: string; tag: string; platform: string; games: number; wins: number }[] } | null = null;
  if (room.championId) {
    brief = {
      players: pulseRows.length,
      games: pulseRows.reduce((a, r) => a + Number(r.games), 0),
      wins: pulseRows.reduce((a, r) => a + Number(r.wins), 0),
      topPlayers: pulseRows.slice(0, 5).map((r) => ({
        name: String(r.game_name), tag: String(r.tag_line), platform: String(r.platform),
        games: Number(r.games), wins: Number(r.wins),
      })),
    };
  }
  const champInfo = room.championId ? champions.find((c) => c.id === room.championId) : null;

  return (
    <div>
      {room.championId
        ? <img className="room-banner" src={splashUrl(room.championId)} alt="" style={{ marginBottom: 14 }} />
        : room.slug === "general"
          ? <img className="room-banner" src="/baron-hero.png" alt="The Baron Pit" style={{ marginBottom: 14, height: 190 }} />
          : <div className="room-banner-broad" style={{ marginBottom: 14 }} />}
      <div style={{ padding: "6px 2px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {room.championId && <img src={championIconUrl(patch, room.championId)} alt="" style={{ width: 64, height: 64, borderRadius: 16, border: "1px solid var(--border)" }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: "-0.01em" }}>{room.name}</h1>
            <div className="meta">
              {room.members} member{room.members === 1 ? "" : "s"}
              {champInfo && <> · {champInfo.title} · {champInfo.tags.join(" / ")}</>}
            </div>
          </div>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 15 }}>{room.description}</p>
        <div className="profile-actions">
          {user ? <JoinButton roomId={room.id} initial={joined} /> : <Link href="/signin" className="btn">Sign in to join</Link>}
        </div>
      </div>

      {brief && (
        <div style={{ padding: "14px 2px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 15.5 }}>{room.championId} in the house — room pulse</h2>
          {brief.games === 0 ? (
            <p className="meta" style={{ margin: 0 }}>
              No tracked {room.championId} games yet. Be the first: <Link href="/player">look up a {room.championId} player</Link> and
              their games will show up here.
            </p>
          ) : (
            <>
              <div className="kv">
                <div><b>{brief.players}</b><span>Players tracked</span></div>
                <div><b>{brief.games}</b><span>Recent games</span></div>
                <div><b>{Math.round((brief.wins / Math.max(1, brief.games)) * 100)}%</b><span>Win rate</span></div>
              </div>
              {brief.topPlayers.map((p) => (
                <div key={`${p.name}#${p.tag}`} className="match-row">
                  <Link href={`/player?platform=${p.platform}&riotId=${encodeURIComponent(`${p.name}#${p.tag}`)}`} style={{ flex: 1, fontWeight: 700, color: "var(--ink)" }}>
                    {p.name}#{p.tag}
                  </Link>
                  <span className="meta">{p.games} games · {p.wins}W–{p.games - p.wins}L</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {user
        ? <Composer roomId={room.id} patch={patch} champions={champions.map((c) => c.id)} userName={user.displayName} userHue={user.avatarHue} />
        : <div style={{ textAlign: "center", padding: "18px 2px", borderBottom: "1px solid var(--border)" }}><Link href="/signin" className="btn">Sign in to post in {room.name}</Link></div>}

      <div>
        {posts.length === 0
          ? <div className="empty">No posts yet — start this room&apos;s first thread.</div>
          : posts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} />)}
      </div>
    </div>
  );
}
