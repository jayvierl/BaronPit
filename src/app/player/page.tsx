import { PilotVisit } from "@/components/pilot-visit";
import { buildCatalog, cardItems } from "@/lib/build-catalog";
import { ItemIcons } from "@/components/item-icons";
import { TeamBaronTag } from "@/components/team-baron-tag";
import { MatchQuestionLinks } from "@/components/match-question-links";
import Image from "next/image";
import Link from "next/link";
import { RefreshPlayer } from "@/components/refresh-player";
import { getCurrentUser } from "@/lib/auth";
import { lookupPlayer, isPlatform, PLATFORMS, currentPatch, championIconUrl, profileIconUrl } from "@/lib/riot";
import { q } from "@/lib/db";
import { publicRiotOwner } from "@/lib/player-insights";
import { splitRiotId } from "@/lib/platforms";
import { LinkPlayerButton, LookupForm, ShareCardButton } from "@/components/social-ui";
import { rankLabel } from "@/components/ui";
import { gameCount, earnedBadges, formReads, splashUrl } from "@/lib/pure";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ searchParams }: {
  searchParams: Promise<{ platform?: string; riotId?: string; name?: string; tag?: string; force?: string }>;
}) {
  const sp = await searchParams;
  const platform = sp.platform && isPlatform(sp.platform) ? sp.platform : "na1";
  const gameName = typeof sp.name === "string" ? sp.name : "";
  const input = typeof sp.riotId === "string" ? sp.riotId : typeof sp.tag === "string" ? `${gameName}#${sp.tag}` : gameName;
  const {gameName:name, tagLine:tag} = splitRiotId(input,platform);

  if (!name || !tag) {
    return (
      <div style={{ maxWidth: 640, margin: "20px auto" }}>
        <div className="card">
          <h1 className="page-title">Player lookup</h1>
          <p className="meta">{input ? "Enter the game name and tag from the Riot ID. For example, Jay Lewis#NA1." : "Look up a player’s recent games, current rank and champion pool."}</p>
          <LookupForm platforms={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} defaultPlatform={platform} initialRiotId={input} />
        </div>
      </div>
    );
  }

  const [result,patch,user] = await Promise.all([
    lookupPlayer(platform,name,tag),
    currentPatch(),getCurrentUser(),
  ]);
  if (!result.ok) {
    const text =
      result.code === "not_found" ? `No player named ${name}#${tag} on ${platform.toUpperCase()}. Check the spelling and the #tag.`
      : result.code === "key_unavailable" || result.code === "invalid_key" ? "Live player lookup is temporarily unavailable. Please try again later."
      : "The Riot API didn't answer just now. Try again in a moment.";
    return (
      <div style={{ maxWidth: 640, margin: "20px auto" }}>
        <div className="card">
          <h1 className="page-title">Lookup</h1>
          <div className="notice warn">{text}</div>
          <LookupForm platforms={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} defaultPlatform={platform} initialRiotId={input} />
        </div>
      </div>
    );
  }

  const player = result.player;
  const snap = player.snapshot;
  const [linked,owner,items] = await Promise.all([
    user ? q`SELECT 1 FROM wp_links WHERE user_id=${user.id} AND puuid=${player.puuid}` : [],
    publicRiotOwner(player.puuid, user?.id ?? null),
    buildCatalog(patch),
  ]);
  const linkedByMe = linked.length > 0;
  const badges = earnedBadges(snap);
  const last3 = snap.matches.slice(0, 3);
  const reads = formReads(snap);
  const mainRole = Object.entries(snap.roles).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topChamp = snap.champPool[0] ?? null;

  // Match history establishes shared games only. Older snapshots have names without tags.
  const mateCounts = new Map<string,number>();
  for (const game of last3) {
    const teammates = new Set((game.teammates ?? []).filter(t => t.name && t.tag).map(t => `${t.name}#${t.tag}`));
    for (const id of teammates) mateCounts.set(id,(mateCounts.get(id) ?? 0) + 1);
  }
  const frequent = [...mateCounts].filter(([,games]) => games >= 2);
  return (
    <div>
      {user?.pilotActive && <PilotVisit kind="stats"/>}
      <div style={{ padding: "6px 2px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}>
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
              {mainRole ? ` · mostly ${mainRole.toLowerCase()}` : ""} · updated <time dateTime={new Date(player.fetchedAt).toISOString()}>{new Date(player.fetchedAt).toLocaleString("en-US",{timeZone:"UTC"})} UTC</time>
            </div>
            {owner && (
              <div className="meta" style={{ marginTop: 3 }}>
                Verified community profile · <Link href={`/u/${owner.id}`} style={{ fontWeight: 600 }}>{owner.name}</Link>
              </div>
            )}
            {badges.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {badges.map((b) => <span key={b} className="chip badge">{b}</span>)}
              </div>
            )}
          </div>
          <Image unoptimized width={84} height={84} src={profileIconUrl(patch, player.profileIcon)} alt="" style={{ width: 84, height: 84, borderRadius: "50%", border: "1px solid var(--border)" }} />
        </div>
        <div className="profile-actions">
          <RefreshPlayer />
          {user && !linkedByMe && <LinkPlayerButton platform={platform} gameName={player.gameName} tagLine={player.tagLine} />}
        </div>
        {result.source === "stale" && <p className="notice" role="status">Riot could not refresh this profile. Showing the last successful lookup.</p>}
        {snap.games > 0 && (
          <div className="meta" style={{ marginTop: 12, fontSize: 14 }}>
            Last {gameCount(snap.games)}:{" "}
            <strong style={{ color: "var(--ink)" }}>{snap.wins}W – {snap.losses}L</strong> · avg KDA{" "}
            <strong style={{ color: "var(--ink)" }}>{snap.kda.toFixed(2)}</strong>
          </div>
        )}
      </div>

      <h2 className="section">Last 3 games</h2>
      {last3.length === 0 && <p className="meta">No recent matches found for this player.</p>}
      {last3.map((m, index) => (
        <div key={m.matchId} className={`game-row ${m.win ? "win" : "loss"}`}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap:"wrap" }}>
            <Image unoptimized width={48} height={48} className="champ-icon" src={championIconUrl(patch, m.champion)} alt="" />
            <div style={{ flex: "1 1 120px", minWidth: 0 }}>
              <span className={m.win ? "win" : "loss"}>{m.win ? "Victory" : "Defeat"}</span>
              <span className="meta"> · {m.champion} · {Math.floor(m.durationSec / 60)}m {m.durationSec % 60}s · {new Date(m.playedAt).toLocaleDateString()}</span>
              <TeamBaronTag match={m} />
              <div className="kda" style={{ fontSize: 16.5 }}>
                {m.kills} / {m.deaths} / {m.assists}
                <span className="meta" style={{ fontWeight: 400, fontFamily: "Inter, sans-serif" }}>
                  {" "}· {m.cs} CS ({(m.cs / Math.max(1, m.durationSec / 60)).toFixed(1)}/min)
                  {m.gold != null ? ` · ${(m.gold / 1000).toFixed(1)}k gold` : ""}
                  {m.role ? ` · ${m.role.toLowerCase()}` : ""}
                </span>
              </div>
            </div>
            <ItemIcons ids={m.items} details={cardItems(items,m.items)} patch={items.patch}/>
          </div>
          <MatchQuestionLinks showStarters={index === 0} puuid={player.puuid} matchId={m.matchId} items={cardItems(items,m.items)}/>
          {(m.teammates ?? []).length > 0 && (
            <div className="teammates">
              <span className="meta" style={{ marginRight: 2 }}>Played with:</span>
              {(m.teammates ?? []).map((t, i) => (
                <span key={i} className="teammate">
                  <Image unoptimized width={18} height={18} src={championIconUrl(patch, t.champion)} alt="" />
                  {t.name && t.tag ? <Link href={`/player?platform=${platform}&riotId=${encodeURIComponent(t.name + "#" + t.tag)}`}>{t.name}#{t.tag}</Link> : t.name || t.champion}
                </span>
              ))}
            </div>
          )}
          {user && (
            <div style={{ marginTop: 9 }}>
              <ShareCardButton puuid={player.puuid} match={m} />
            </div>
          )}
        </div>
      ))}
      {frequent.length > 0 && (
        <p className="meta">Also on the same team recently · {frequent.map(([name,games]) => `${name} (${games} games)`).join(", ")}</p>
      )}
      {snap.matches.length > 3 && <details className="card">
        <summary>See all {snap.matches.length} recent games</summary>
        {snap.matches.slice(3).map(m => <div key={m.matchId} className="match-row">
          <Image unoptimized width={32} height={32} className="champ-icon sm" src={championIconUrl(patch,m.champion)} alt="" />
          <strong>{m.champion}</strong><span className={m.win ? "win" : "loss"}>{m.win ? "Victory" : "Defeat"}</span>
          <span className="meta">{m.kills}/{m.deaths}/{m.assists} · {new Date(m.playedAt).toLocaleDateString()}</span>
          <TeamBaronTag match={m} />
        </div>)}
      </details>}

      {reads.length > 0 && (
        <>
          <h2 className="section">Recent performance</h2>
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
              <Image unoptimized width={32} height={32} className="champ-icon sm" src={championIconUrl(patch, c.champion)} alt="" />
              <strong style={{ flex: 1 }}>{c.champion}</strong>
              <span className="meta">{gameCount(c.games)} · {c.wins}W–{c.games - c.wins}L</span>
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
            <Image unoptimized width={1215} height={717} className="splash" src={splashUrl(topChamp.champion)} alt="" />
            <div className="overlay">
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#e9d9a8" }}>
                The main
              </div>
              <div className="display" style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.15 }}>{topChamp.champion}</div>
              <div style={{ fontSize: 14.5 }}>
                {gameCount(topChamp.games)} · {Math.round((topChamp.wins / Math.max(1, topChamp.games)) * 100)}% win rate · {topChamp.kda.toFixed(2)} KDA
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
