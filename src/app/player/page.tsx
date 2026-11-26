import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { lookupPlayer, isPlatform, PLATFORMS, currentPatch, championIconUrl, profileIconUrl } from "@/lib/riot";
import { q } from "@/lib/db";
import { LinkPlayerButton, LookupForm, ShareCardButton } from "@/components/social-ui";
import { rankLabel } from "@/components/ui";
import { earnedBadges, formReads, splashUrl } from "@/lib/pure";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ searchParams }: {
  searchParams: Promise<{ platform?: string; riotId?: string; name?: string; tag?: string; force?: string }>;
}) {
  const sp = await searchParams;
  const platform = sp.platform && isPlatform(sp.platform) ? sp.platform : "na1";
  let name = sp.name ?? "";
  let tag = sp.tag ?? "";
  if (sp.riotId) {
    const hash = sp.riotId.lastIndexOf("#");
    if (hash > 0) { name = sp.riotId.slice(0, hash); tag = sp.riotId.slice(hash + 1); }
    else name = sp.riotId;
  }
  const patch = await currentPatch();
  const user = await getCurrentUser().catch(() => null);

  if (!name || !tag) {
    return (
      <div style={{ maxWidth: 640, margin: "20px auto" }}>
        <div className="card">
          <h1 className="page-title">Player lookup</h1>
          <p className="meta">Recent form only — the last ~20 games, current rank, champion pool. No dusty archives.</p>
          <LookupForm platforms={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} defaultPlatform={platform} />
        </div>
      </div>
    );
  }

  const result = await lookupPlayer(platform, name, tag, sp.force === "1");
  if (!result.ok) {
    const text =
      result.code === "not_found" ? `No player named ${name}#${tag} on ${platform.toUpperCase()}. Check the spelling and the #tag.`
      : result.code === "key_unavailable" || result.code === "invalid_key" ? "Player lookup is briefly unavailable while our API key rotates. Try again in a minute."
      : "The Riot API didn't answer just now. Try again in a moment.";
    return (
      <div style={{ maxWidth: 640, margin: "20px auto" }}>
        <div className="card">
          <h1 className="page-title">Lookup</h1>
          <div className="notice warn">{text}</div>
          <LookupForm platforms={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} defaultPlatform={platform} />
        </div>
      </div>
    );
  }

  const player = result.player;
  const snap = player.snapshot;
  const linkedByMe = user
    ? (await q`SELECT 1 FROM wp_links WHERE user_id = ${user.id} AND puuid = ${player.puuid}`.catch(() => [])).length > 0
    : false;
  const owner = await q`SELECT u.id, u.display_name FROM wp_links l JOIN wp_users u ON u.id = l.user_id WHERE l.puuid = ${player.puuid} LIMIT 1`.catch(() => []);
  const riotId = `${player.gameName}#${player.tagLine}`;

  const last3 = snap.matches.slice(0, 3);
  const reads = formReads(snap);
  const mainRole = Object.entries(snap.roles).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topChamp = snap.champPool[0] ?? null;

  // A teammate who shows up in 2+ of the last 3 games is a duo.
  const mateCounts = new Map<string, number>();
  for (const m of last3) for (const t of m.teammates ?? []) {
    if (t.name) mateCounts.set(t.name, (mateCounts.get(t.name) ?? 0) + 1);
  }
  const duos = [...mateCounts.entries()].filter(([, n]) => n >= 2).map(([name]) => name);

  return (
    <div>
      <div style={{ padding: "6px 2px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="profile-name">
              {player.gameName}
              <span style={{ color: "var(--ink-soft)", fontWeight: 500 }}>#{player.tagLine}</span>
            </h1>
            <div style={{ fontSize: 14.5, marginTop: 2 }}>
              <span className="display" style={{ fontWeight: 700, fontSize: 16.5 }}>{rankLabel(player.rankTier, player.rankDiv, player.rankLp)}</span>
              {player.rankWins != null && <span className="meta"> · {player.rankWins}W – {player.rankLosses}L this season</span>}
            </div>
            <div className="meta" style={{ marginTop: 3 }}>
              {platform.toUpperCase()} · Level {player.summonerLevel}
              {mainRole ? ` · mostly ${mainRole.toLowerCase()}` : ""} · updated {new Date(player.fetchedAt).toLocaleTimeString()}
            </div>
            {owner.length > 0 && (
              <div className="meta" style={{ marginTop: 3 }}>
                On Baron Pit as <Link href={`/u/${Number(owner[0].id)}`} style={{ fontWeight: 600 }}>{String(owner[0].display_name)}</Link>
              </div>
            )}
            {earnedBadges(snap).length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {earnedBadges(snap).map((b) => <span key={b} className="chip badge">{b}</span>)}
              </div>
            )}
          </div>
          <img src={profileIconUrl(patch, player.profileIcon)} alt="" style={{ width: 84, height: 84, borderRadius: "50%", border: "1px solid var(--border)" }} />
        </div>
        <div className="profile-actions">
          <Link className="btn secondary" href={`/player?platform=${platform}&riotId=${encodeURIComponent(riotId)}&force=1`}>Refresh stats</Link>
          {user && !linkedByMe && <LinkPlayerButton platform={platform} gameName={player.gameName} tagLine={player.tagLine} />}
        </div>
        {snap.games > 0 && (
          <div className="meta" style={{ marginTop: 12, fontSize: 14 }}>
            Last {snap.games} games:{" "}
            <strong style={{ color: "var(--ink)" }}>{snap.wins}W – {snap.losses}L</strong> · avg KDA{" "}
            <strong style={{ color: "var(--ink)" }}>{snap.kda.toFixed(2)}</strong>
          </div>
        )}
      </div>

      <h2 className="section">Last 3 games</h2>
      {last3.length === 0 && <p className="meta">No recent matches found for this player.</p>}
      {last3.map((m) => (
        <div key={m.matchId} className={`game-row ${m.win ? "win" : "loss"}`}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <img className="champ-icon" src={championIconUrl(patch, m.champion)} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className={m.win ? "win" : "loss"}>{m.win ? "Victory" : "Defeat"}</span>
              <span className="meta"> · {m.champion} · {Math.floor(m.durationSec / 60)}m {m.durationSec % 60}s · {new Date(m.playedAt).toLocaleDateString()}</span>
              {m.baron && <span className="baron-tag">🟣 Baron secured</span>}
              <div className="kda" style={{ fontSize: 16.5 }}>
                {m.kills} / {m.deaths} / {m.assists}
                <span className="meta" style={{ fontWeight: 400, fontFamily: "Inter, sans-serif" }}>
                  {" "}· {m.cs} CS ({(m.cs / Math.max(1, m.durationSec / 60)).toFixed(1)}/min)
                  {m.gold != null ? ` · ${(m.gold / 1000).toFixed(1)}k gold` : ""}
                  {m.role ? ` · ${m.role.toLowerCase()}` : ""}
                </span>
              </div>
            </div>
            <div className="build-items" style={{ margin: 0 }}>
              {m.items.map((id, i) => <img key={i} src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`} alt="" style={{ width: 28, height: 28 }} />)}
            </div>
          </div>
          {(m.teammates ?? []).length > 0 && (
            <div className="teammates">
              <span className="meta" style={{ marginRight: 2 }}>Played with:</span>
              {(m.teammates ?? []).map((t, i) => (
                <span key={i} className="teammate">
                  <img src={championIconUrl(patch, t.champion)} alt="" />
                  {t.name || t.champion}
                  {t.name && duos.includes(t.name) && <span className="duo-tag">· duo</span>}
                </span>
              ))}
            </div>
          )}
          {user && (
            <div style={{ marginTop: 9 }}>
              <ShareCardButton puuid={player.puuid} platform={platform} riotId={riotId}
                match={{ matchId: m.matchId, champion: m.champion, win: m.win, kills: m.kills, deaths: m.deaths, assists: m.assists, cs: m.cs, items: m.items }} />
            </div>
          )}
        </div>
      ))}
      {duos.length > 0 && (
        <p style={{ fontSize: 14.5, marginTop: 10 }}>
          <span className="duo-tag">Duo:</span> {duos.join(", ")} — queued together in {mateCounts.get(duos[0])} of the last 3 games.
        </p>
      )}

      {reads.length > 0 && (
        <>
          <h2 className="section">How they compare</h2>
          <div>
            {reads.map((r) => (
              <div key={r.label} className="read-row">
                <span className={`read-dot ${r.tone}`} />
                <span style={{ fontWeight: 600, minWidth: 108 }}>{r.label}</span>
                <span className="display" style={{ fontWeight: 600 }}>{r.value}</span>
                <span className="meta">{r.note}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {snap.champPool.length > 1 && (
        <>
          <h2 className="section">Champion pool</h2>
          {snap.champPool.slice(1).map((c) => (
            <div key={c.champion} className="match-row">
              <img className="champ-icon sm" src={championIconUrl(patch, c.champion)} alt="" />
              <strong style={{ flex: 1 }}>{c.champion}</strong>
              <span className="meta">{c.games} games · {c.wins}W–{c.games - c.wins}L</span>
              <span className="kda">{c.kda.toFixed(2)} KDA</span>
              <Link className="text-btn" href={`/rooms/champ-${c.champion.toLowerCase()}`}>Room →</Link>
            </div>
          ))}
        </>
      )}

      {topChamp && (
        <>
          <h2 className="section">Most played</h2>
          <div className="showcase">
            <img className="splash" src={splashUrl(topChamp.champion)} alt="" />
            <div className="overlay">
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#e9d9a8" }}>
                The main
              </div>
              <div className="display" style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.15 }}>{topChamp.champion}</div>
              <div style={{ fontSize: 14.5 }}>
                {topChamp.games} games · {Math.round((topChamp.wins / Math.max(1, topChamp.games)) * 100)}% win rate · {topChamp.kda.toFixed(2)} KDA
                {"  "}
                <Link href={`/rooms/champ-${topChamp.champion.toLowerCase()}`} style={{ color: "#fff", fontWeight: 600 }}>Visit the {topChamp.champion} room →</Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
