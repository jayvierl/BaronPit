import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { dbAvailable, q } from "@/lib/db";
import { feed, listRooms, todaysSpotlight, dailyHighlight } from "@/lib/social";
import { currentPatch, championList, championIconUrl } from "@/lib/riot";
import { BaronTimer, Composer, JoinButton, MatchCard, PostCard } from "@/components/social-ui";
import { rankLabel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const user = await getCurrentUser().catch(() => null);
  const activeTab = tab === "following" && user ? "following" : "everyone";
  const today = new Date().toISOString().slice(0, 10);
  const [patch, champions] = await Promise.all([currentPatch(), championList()]);

  let posts: Awaited<ReturnType<typeof feed>> = [];
  let rooms: Awaited<ReturnType<typeof listRooms>> = [];
  let spotlight: Awaited<ReturnType<typeof todaysSpotlight>> = null;
  let trending: { champion: string; games: number }[] = [];
  let objective: { label: string; count: number; target: number } | null = null;
  if (dbAvailable()) {
    // Independent loads run in parallel; trending is aggregated in SQL over
    // champPool — full snapshots never leave the database (audit D3/D4).
    const [postsR, roomsR, spotlightR, trendRows, objRows] = await Promise.all([
      feed(user, activeTab).catch(() => []),
      listRooms(user?.id).catch(() => []),
      todaysSpotlight(today).catch(() => null),
      q`SELECT elem->>'champion' AS champion, sum((elem->>'games')::int)::int AS games
        FROM wp_players, jsonb_array_elements(snapshot->'champPool') AS elem
        WHERE snapshot <> '{}'::jsonb
        GROUP BY 1 ORDER BY 2 DESC LIMIT 6`.catch(() => []),
      q`SELECT
          (SELECT count(*)::int FROM wp_posts WHERE kind = 'card' AND created_at::date = CURRENT_DATE) AS cards,
          (SELECT count(*)::int FROM wp_posts WHERE kind = 'build' AND created_at::date = CURRENT_DATE) AS builds,
          (SELECT count(*)::int FROM wp_comments WHERE one_fix AND created_at::date = CURRENT_DATE) AS fixes,
          (SELECT count(*)::int FROM wp_lfg WHERE created_at::date = CURRENT_DATE) AS lfg,
          (SELECT count(*)::int FROM wp_reactions WHERE created_at::date = CURRENT_DATE) AS reactions`.catch(() => []),
    ]);
    posts = postsR; rooms = roomsR; spotlight = spotlightR;
    trending = trendRows.map((r) => ({ champion: String(r.champion), games: Number(r.games) }));
    if (objRows.length) {
      const o = objRows[0];
      const menu = [
        { label: "Share 10 game cards", count: Number(o.cards), target: 10 },
        { label: "Post 5 builds", count: Number(o.builds), target: 5 },
        { label: "Drop 15 one-fix comments", count: Number(o.fixes), target: 15 },
        { label: "Open 8 duo listings", count: Number(o.lfg), target: 8 },
        { label: "Give 25 reactions", count: Number(o.reactions), target: 25 },
      ];
      const dayIndex = Math.floor(Date.parse(today) / 86400000) % menu.length;
      objective = menu[dayIndex];
    }
  }
  const spotlightGame = spotlight ? dailyHighlight(spotlight.player, today) : null;

  return (
    <div>
      <div className="tabs">
        <Link href="/?tab=everyone" className={activeTab === "everyone" ? "active" : ""}>For you</Link>
        {user
          ? <Link href="/?tab=following" className={activeTab === "following" ? "active" : ""}>Following</Link>
          : <Link href="/signin">Following</Link>}
      </div>

      {user ? (
        <Composer patch={patch} champions={champions.map((c) => c.id)} userName={user.displayName} userHue={user.avatarHue} />
      ) : (
        <div style={{ padding: "22px 2px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
          <img className="brand-emblem" src="/baron-emblem.png" alt="Baron Pit emblem" style={{ marginBottom: 12 }} />
          <br />
          <strong style={{ fontSize: 16 }}>Never take Baron alone.</strong>
          <p className="meta" style={{ margin: "6px auto 14px", maxWidth: 420 }}>
            Follow players, trade takes and builds, gather in champion rooms, find a duo whose rank is real.
            Passwordless sign-in — we email you a link.
          </p>
          <Link href="/signin" className="btn">Create your account</Link>
        </div>
      )}

      {spotlight && spotlightGame && (
        <div className="spotlight">
          <div className="spot-label">🟣 Holding the Baron buff today</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "9px 0 2px" }}>
            <img className="champ-icon" src={championIconUrl(patch, spotlightGame.champion)} alt="" />
            <div>
              <strong>{spotlight.player.gameName}#{spotlight.player.tagLine}</strong>
              <div className="meta">{rankLabel(spotlight.player.rankTier, spotlight.player.rankDiv, spotlight.player.rankLp)}</div>
            </div>
          </div>
          <MatchCard patch={patch} data={{ riotId: `${spotlight.player.gameName}#${spotlight.player.tagLine}`, match: spotlightGame }} />
          {spotlight.ownerId && (
            <p style={{ margin: "10px 0 0", fontSize: 14.5 }}>
              <Link href={`/u/${spotlight.ownerId}`}>Visit {spotlight.ownerName}&apos;s profile →</Link>
            </p>
          )}
        </div>
      )}

      {objective && (
        <div className="objective">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span className="spot-label">🟣 Today&apos;s objective</span>
            <span className="meta">{Math.min(objective.count, objective.target)}/{objective.target}</span>
          </div>
          <div style={{ fontWeight: 600, margin: "5px 0 7px" }}>
            {objective.count >= objective.target ? "Objective secured — the pit provides. 🟣" : objective.label}
          </div>
          <div className="obj-bar"><span style={{ width: `${Math.min(100, Math.round((objective.count / objective.target) * 100))}%` }} /></div>
        </div>
      )}

      <div>
        {posts.length === 0 ? (
          <div className="empty">
            <p><strong style={{ color: "var(--ink)" }}>The floor is open.</strong></p>
            <p>Nothing here yet — the first posts set the tone. Look up a player, share a game card, or open a room and say hello.</p>
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} />)
        )}
      </div>

      {rooms.length > 0 && (
        <>
          <h2 className="section">Rooms</h2>
          <div style={{ marginBottom: 10 }}><BaronTimer /></div>
          <div>
            {rooms.slice(0, 6).map((r) => (
              <div key={r.id} className="list-row">
                <span style={{ display: "inline-flex", gap: 9, alignItems: "center" }}>
                  {r.championId && <img src={championIconUrl(patch, r.championId)} alt="" style={{ width: 26, height: 26, borderRadius: 7 }} />}
                  <span>
                    <Link href={`/rooms/${r.slug}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                    <span className="meta"> · {r.members} member{r.members === 1 ? "" : "s"}</span>
                  </span>
                </span>
                {user && <JoinButton roomId={r.id} initial={r.joined} />}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 14.5 }}><Link href="/rooms">All rooms →</Link></p>
        </>
      )}

      {trending.length > 0 && (
        <>
          <h2 className="section">Trending champions</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingBottom: 8 }}>
            {trending.map((t) => (
              <Link key={t.champion} href={`/rooms/champ-${t.champion.toLowerCase()}`} className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <img src={championIconUrl(patch, t.champion)} alt="" style={{ width: 18, height: 18, borderRadius: 5 }} />
                {t.champion} · {t.games} games
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="meta" style={{ marginTop: 18 }}>
        House rules, short version: be kind, back your takes with games, keep first contact in-app. Moderation is
        fast and shows its work — <Link href="/guidelines">read the guidelines</Link>.
      </p>
    </div>
  );
}
