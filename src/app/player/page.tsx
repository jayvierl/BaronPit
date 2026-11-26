import { Suspense } from "react";
import { PilotVisit } from "@/components/pilot-visit";
import { buildCatalog, cardItems } from "@/lib/build-catalog";
import { ItemIcons } from "@/components/item-icons";
import { TeamBaronTag } from "@/components/team-baron-tag";
import { MatchQuestionLinks } from "@/components/match-question-links";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Avatar } from "@/components/ui";
import Link from "next/link";
import Form from "next/form";
import { matchQueueName, recentMatchHistory } from "@/lib/match-history";
import styles from "./history.module.css";
import { RefreshPlayer } from "@/components/refresh-player";
import { getCurrentUser } from "@/lib/auth";
import { lookupPlayer, isPlatform, PLATFORMS, currentPatch, profileIconUrl } from "@/lib/riot";
import { q } from "@/lib/db";
import { publicRiotOwner } from "@/lib/player-insights";
import { playerStatsHref, splitRiotId } from "@/lib/platforms";
import { LinkPlayerButton, LookupForm, ShareCardButton } from "@/components/social-ui";
import { PlayerStats } from "@/components/player-stats";
import { gameCount, earnedBadges, formReads, type MatchSummary } from "@/lib/pure";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ searchParams }: {
  searchParams: Promise<{ platform?: string; riotId?: string; name?: string; tag?: string; force?: string; queue?: string; champion?: string }>;
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
  const [linked,owner] = await Promise.all([
    user ? q`SELECT 1 FROM wp_links WHERE user_id=${user.id} AND puuid=${player.puuid}` : [],
    publicRiotOwner(player.puuid, user?.id ?? null),
  ]);
  const linkedByMe = linked.length > 0;
  const badges = earnedBadges(snap);
  const history = recentMatchHistory(snap.matches, sp.queue, sp.champion);
  const latest = history.matches.slice(0,3);
  const filtered = Boolean(history.queue || history.champion);
  const historyHref = playerStatsHref(player.platform, player.gameName + "#" + player.tagLine) + "#match-history";
  const reads = formReads(snap);

  // Match history establishes shared games only. Older snapshots have names without tags.
  const mateCounts = new Map<string,number>();
  for (const game of snap.matches.slice(0,3)) {
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
            <div className="meta" style={{ marginTop: 3 }}>
              {platform.toUpperCase()}{player.summonerLevel > 0 && ` · Level ${player.summonerLevel}`}
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
          <Avatar name={player.gameName} hue={265} size={84} imageUrl={profileIconUrl(patch, player.profileIcon)} />
        </div>
        <PlayerStats player={player} source={result.source} />
        <div className="profile-actions">
          <RefreshPlayer />
          {user && !linkedByMe && <LinkPlayerButton platform={platform} gameName={player.gameName} tagLine={player.tagLine} />}
        </div>
      </div>

      <h2 id="match-history" className={styles.heading}>Match history</h2>
      {history.sampleSize > 0 && <>
        <Form action="/player#match-history" className={styles.filters} key={JSON.stringify([player.puuid, history.queue, history.champion])}>
          <input type="hidden" name="platform" value={platform}/>
          <input type="hidden" name="riotId" value={player.gameName + "#" + player.tagLine}/>
          <label>Queue<select name="queue" defaultValue={history.queue}>
            <option value="">All queues</option>
            {history.queue && !history.queues.includes(history.queue) && <option value={history.queue}>Outside this sample</option>}
            {history.queues.map(q => <option key={q} value={q}>{matchQueueName(q)}</option>)}
          </select></label>
          <label>Champion<select name="champion" defaultValue={history.champion}>
            <option value="">All champions</option>
            {history.champion && !history.champions.includes(history.champion) && <option value={history.champion}>Outside this sample</option>}
            {history.champions.map(c => <option key={c} value={c}>{c}</option>)}
          </select></label>
          <button className="btn secondary small">Apply</button>
        </Form>
        <p className={styles.result} aria-live="polite">
          {history.winRate === null ? `No matching games in the last ${gameCount(history.sampleSize)}` : <>
            {filtered ? `${history.matches.length} of ${gameCount(history.sampleSize)}` : `Last ${gameCount(history.sampleSize)}`}
            {" · "}{history.wins}W–{history.losses}L · {history.winRate}% win rate
          </>}
          {filtered && <Link href={historyHref} className={styles.reset}>Clear filters</Link>}
        </p>
      </>}
      {history.sampleSize === 0 && <p className="meta">No recent matches found for this player.</p>}
      {latest.length > 0 && (
        <Suspense fallback={<p className="meta" role="status">Loading recent games…</p>}>
          <LatestGames matches={latest} patch={patch} platform={platform} puuid={player.puuid} signedIn={Boolean(user)} />
        </Suspense>
      )}
      {!filtered && frequent.length > 0 && (
        <p className="meta">Also on the same team recently · {frequent.map(([name,games]) => `${name} (${games} games)`).join(", ")}</p>
      )}
      {history.matches.length > 3 && <details className="card" key={historyHref + history.queue + history.champion}>
        <summary>Show {gameCount(history.matches.length - 3)} more</summary>
        {history.matches.slice(3).map(m => <div key={m.matchId} className="match-row">
          <ChampionPortrait id={m.champion} patch={patch} size={32} />
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

      {snap.champPool.length > 0 && (
        <details className="card">
          <summary>Champion pool · wins, losses and KDA</summary>
          {snap.champPool.map((c) => (
            <div key={c.champion} className="match-row">
              <ChampionPortrait id={c.champion} patch={patch} size={32} />
              <strong style={{ flex: 1 }}>{c.champion}</strong>
              <span className="meta">{gameCount(c.games)} · {c.wins}W–{c.games - c.wins}L{c.games > 0 && ` · ${Math.round(100 * c.wins / c.games)}% WR`}</span>
              <span className="kda">{c.kda.toFixed(2)} KDA</span>
              <Link className="text-btn" href={`/rooms/champ-${c.champion.toLowerCase()}`}>Room →</Link>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

async function LatestGames({ matches, patch, platform, puuid, signedIn }: {
  matches: MatchSummary[];
  patch: string;
  platform: string;
  puuid: string;
  signedIn: boolean;
}) {
  const catalog = await buildCatalog(patch);
  return matches.map((m, index) => {
    const details = cardItems(catalog, m.items);
    return (
      <div key={m.matchId} className={`game-row ${m.win ? "win" : "loss"}`}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap:"wrap" }}>
          <ChampionPortrait id={m.champion} patch={patch} size={48} />
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
          <ItemIcons ids={m.items} details={details} patch={catalog.patch}/>
        </div>
        <MatchQuestionLinks showStarters={index === 0} puuid={puuid} matchId={m.matchId} items={details}/>
        {(m.teammates ?? []).length > 0 && (
          <div className="teammates">
            <span className="meta" style={{ marginRight: 2 }}>Played with:</span>
            {(m.teammates ?? []).map((t, i) => (
              <span key={i} className="teammate">
                <ChampionPortrait id={t.champion} patch={patch} size={18} />
                {t.name && t.tag ? <Link prefetch={false} href={playerStatsHref(platform, t.name + "#" + t.tag)}>{t.name}#{t.tag}</Link> : t.champion}
              </span>
            ))}
          </div>
        )}
        {signedIn && (
          <div style={{ marginTop: 9 }}>
            <ShareCardButton puuid={puuid} match={m} />
          </div>
        )}
      </div>
    );
  });
}
