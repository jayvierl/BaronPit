import { PilotVisit } from "@/components/pilot-visit";
import { WinStreak } from "@/components/win-streak";
import { currentWinStreak } from "@/lib/current-win-streak";
import { Avatar } from "@/components/ui";
import Link from "next/link";
import Form from "next/form";
import { MATCH_DETAIL_LIMIT, matchQueueName, matchSectionId, recentMatchHistory } from "@/lib/match-history";
import { LatestGames, OlderGames } from "./match-history-view";
import styles from "./history.module.css";
import profileStyles from "./profile.module.css";
import { buildPlayerAnalytics } from "@/lib/player-analytics";
import { PlayerActivity, PlayerChampionAnalytics, PlayerPerformance, PlayerPlayStyle } from "@/components/player-analytics";
import { masteryNeedsCatalog, PlayerMastery } from "@/components/player-mastery";
import { PlayerRankHistory } from "@/components/player-rank-history";
import { RefreshPlayer } from "@/components/refresh-player";
import { getCurrentUser } from "@/lib/auth";
import { lookupPlayer, isPlatform, PLATFORMS, currentPatch, championList, profileIconUrl } from "@/lib/riot";
import { q } from "@/lib/db";
import { publicRiotOwner } from "@/lib/player-insights";
import { visibleChampionRoomSlugs } from "@/lib/rooms";
import { playerStatsHref, splitRiotId } from "@/lib/platforms";
import { readSearchReturn, searchHref, withSearchReturn } from "@/lib/search-scopes";
import { safeReturnTo } from "@/lib/signin-return";
import { validId } from "@/lib/ids";
import { LinkPlayerButton, LookupForm } from "@/components/social-ui";
import { PlayerStats } from "@/components/player-stats";
import { RecentResults } from "@/components/player-overview";
import { gameCount, earnedBadges } from "@/lib/pure";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ searchParams }: {
  searchParams: Promise<{ platform?: string; riotId?: string; name?: string; tag?: string; force?: string; match?: string; older?: string; queue?: string; champion?: string; from?: string; fromPlayer?: string; fromDiscussion?: string }>;
}) {
  const sp = await searchParams;
  const platform = sp.platform && isPlatform(sp.platform) ? sp.platform : "na1";
  const searchReturn = readSearchReturn(sp.from);
  const playerPath = safeReturnTo(sp.fromPlayer);
  const playerReturn = playerPath.startsWith("/player?") ? playerPath : undefined;
  const gameName = typeof sp.name === "string" ? sp.name : "";
  const input = typeof sp.riotId === "string" ? sp.riotId : typeof sp.tag === "string" ? `${gameName}#${sp.tag}` : gameName;
  const {gameName:name, tagLine:tag} = splitRiotId(input,platform);
  const previous = playerReturn ?? searchReturn;
  const searchLink = previous && <Link href={previous} className={styles.searchLink}>← {playerReturn ? "Back to previous player" : "Back to search"}</Link>;
  const discussionId = typeof sp.fromDiscussion === "string" && /^\d+$/.test(sp.fromDiscussion) && validId(Number(sp.fromDiscussion)) &&
    typeof sp.match === "string" && matchSectionId(sp.match) ? Number(sp.fromDiscussion) : null;
  const discussionLink = discussionId && <Link href={`/post/${discussionId}`} className={styles.searchLink} prefetch={false}>← Back to discussion</Link>;
  const lookupForm = <LookupForm key={JSON.stringify([input, platform])} platforms={PLATFORMS.map(({id,label}) => ({ id, label }))}
    defaultPlatform={platform} initialRiotId={input} searchReturn={searchReturn} playerReturn={playerReturn} />;

  if (!name || !tag) {
    return (
      <div style={{ maxWidth: 640, margin: "20px auto" }}>
        {discussionLink || searchLink}
        <div className="card">
          <h1 className="page-title">Player lookup</h1>
          <p className="meta">{input ? "Enter the game name and tag from the Riot ID. For example, Jay Lewis#NA1." : "Look up a player’s recent games, current rank and champion pool."}</p>
          {lookupForm}
        </div>
      </div>
    );
  }

  const [result,patch,user] = await Promise.all([
    lookupPlayer(platform, name, tag, { profile: true, force: sp.force === "1" }),
    currentPatch(),getCurrentUser(),
  ]);
  if (!result.ok) {
    const text =
      result.code === "not_found" ? `No player named ${name}#${tag} on ${platform.toUpperCase()}. Check the spelling and the #tag.`
      : result.code === "key_unavailable" || result.code === "invalid_key" ? "Live player lookup is temporarily unavailable. Please try again later."
      : result.code === "rate_limited" ? "Riot is limiting lookups. Wait a moment before trying again."
      : "The Riot API didn't answer just now. Try again in a moment.";
    return (
      <div style={{ maxWidth: 640, margin: "20px auto" }}>
        {discussionLink || searchLink}
        <div className="card">
          <h1 className="page-title">Lookup</h1>
          <div className="notice warn">{discussionId ? `This match link couldn’t open the player’s history. ${text}` : text}</div>
          {lookupForm}
          <Link className={styles.searchLink} href={searchHref("players", input, platform, true)}>Search saved player records</Link>
        </div>
      </div>
    );
  }

  const player = result.player;
  const partial = result.source === "partial";
  const snap = player.snapshot;
  const matches = player.matchHistory?.matches ?? snap.matches;
  const analytics = buildPlayerAnalytics(matches);
  const incompleteHistory = partial || player.matchHistory?.complete === false;
  const [linked,owner,roomSlugs,masteryCatalog] = await Promise.all([
    user ? q`SELECT 1 FROM wp_links WHERE user_id=${user.id} AND puuid=${player.puuid}` : [],
    publicRiotOwner(player.puuid, user?.id ?? null),
    visibleChampionRoomSlugs(analytics.champions.map(entry => entry.id)).catch(() => []),
    masteryNeedsCatalog(player.championMastery) ? championList() : [],
  ]);
  const publicRooms = new Set(roomSlugs);
  const linkedByMe = linked.length > 0;
  const badges = earnedBadges(snap);
  const streak = partial ? null : currentWinStreak(snap, player.fetchedAt);
  const history = recentMatchHistory(matches, sp.queue, sp.champion);
  const latest = history.matches.slice(0, MATCH_DETAIL_LIMIT);
  const filtered = Boolean(history.queue || history.champion);
  const route = new URL(withSearchReturn(playerStatsHref(player.platform, player.gameName + "#" + player.tagLine), searchReturn), "https://lookup.invalid");
  if (playerReturn) route.searchParams.set("fromPlayer", playerReturn);
  if (discussionId) route.searchParams.set("fromDiscussion", String(discussionId));
  const lookupHref = route.pathname + route.search;
  if (history.queue) route.searchParams.set("queue", history.queue);
  if (history.champion) route.searchParams.set("champion", history.champion);
  if (typeof sp.match === "string" && matchSectionId(sp.match)) route.searchParams.set("match", sp.match);
  if (typeof sp.older === "string" && /^\d{1,3}$/.test(sp.older)) route.searchParams.set("older", sp.older);
  const refreshHref = route.pathname + route.search;
  const historyHref = `${lookupHref}#match-history`;

  // Match history establishes shared games only. Older snapshots have names without tags.
  const mateCounts = new Map<string,number>();
  for (const game of snap.matches.slice(0,3)) {
    if (game.queueId === 0) continue;
    const teammates = new Set((game.teammates ?? []).filter(t => t.name && t.tag).map(t => `${t.name}#${t.tag}`));
    for (const id of teammates) mateCounts.set(id,(mateCounts.get(id) ?? 0) + 1);
  }
  const frequent = [...mateCounts].filter(([,games]) => games >= 2);
  return (
    <div>
      {user?.pilotActive && <PilotVisit kind="stats"/>}
      {discussionLink || searchLink || <Link className={styles.searchLink} href={searchHref("players", "", platform)}>Search for another player</Link>}
      <header>
        <div className={profileStyles.identity}>
          <div className={profileStyles.identityText}>
            <h1 className="profile-name">{player.gameName}<span className={profileStyles.tag}>#{player.tagLine}</span></h1>
            <p className="meta">
              {platform.toUpperCase()}{player.summonerLevel > 0 && ` · Level ${player.summonerLevel}`}
              {streak && <> · <WinStreak wins={streak}/></>}
            </p>
            {owner && <p className="meta">Verified community profile · <Link href={withSearchReturn(`/u/${owner.id}`, searchReturn)}>{owner.name}</Link></p>}
            {badges.length > 0 && <div className={profileStyles.badges} aria-label="Recent 20-game highlights">
              {badges.map(b => <span key={b} className="chip badge">{b}</span>)}
            </div>}
          </div>
          <Avatar name={player.gameName} hue={265} size={84} imageUrl={profileIconUrl(patch, player.profileIcon)} />
        </div>
        <RefreshPlayer href={refreshHref} fetchedAt={player.fetchedAt} source={result.source} retryAt={result.retryAt} requested={sp.force === "1"} />
        {user && !linkedByMe && !partial && <LinkPlayerButton platform={platform} gameName={player.gameName} tagLine={player.tagLine} />}
      </header>
      <nav className={profileStyles.profileNav} aria-label="Player sections">
        <a href="#summary">Summary</a><a href="#match-history">Matches</a><a href="#player-champions">Champions</a>
        <a href="#player-mastery">Mastery</a><a href="#rank-history" aria-label="Rank history">Ranks</a>
      </nav>
      <div id="summary" className={profileStyles.anchor}>
        <PlayerStats player={player} source={result.source} variant="profile" lookupHref={history.sampleSize ? "#match-history" : undefined} />
        <RecentResults matches={snap.matches} historyPath={filtered || sp.match || sp.older ? lookupHref : ""} partial={partial} />
        <PlayerPlayStyle analytics={analytics} partial={incompleteHistory}/>
      </div>
      <h2 id="match-history" className={styles.heading}>Match history</h2>
      {history.sampleSize > 0 && <>
        <Form action="/player#match-history" className={styles.filters} key={JSON.stringify([platform, player.gameName, player.tagLine, history.queue, history.champion])}>
          <input type="hidden" name="platform" value={platform}/>
          <input type="hidden" name="riotId" value={player.gameName + "#" + player.tagLine}/>
          {searchReturn && <input type="hidden" name="from" value={searchReturn}/>}
          {playerReturn && <input type="hidden" name="fromPlayer" value={playerReturn}/>}
          <label>Queue<select name="queue" defaultValue={history.queue}>
            <option value="">All supported queues</option>
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
          {history.winRate === null ? `No matching games in ${incompleteHistory ? "the available" : "the last"} ${gameCount(history.sampleSize)}` : <>
            {filtered ? `${history.matches.length} of ${gameCount(history.sampleSize)}` : incompleteHistory ? `${gameCount(history.sampleSize)} available` : `Last ${gameCount(history.sampleSize)}`}
            {" · "}{history.wins}W–{history.losses}L · {history.winRate}% win rate
          </>}
          {filtered && <Link href={historyHref} className={styles.reset}>Clear filters</Link>}
        </p>
      </>}
      {history.sampleSize === 0 && !discussionId && <p className="meta">{partial ? "Riot couldn’t provide recent matches for this lookup." : "No recent matches found for this player."}</p>}
      {latest.length > 0 && (
        <LatestGames matches={latest} patch={patch} platform={player.platform} riotId={`${player.gameName}#${player.tagLine}`}
          persisted={!partial} communityMatchIds={new Set(snap.matches.map(m => m.matchId))} lookupHref={lookupHref}
          queueFilter={history.queue} championFilter={history.champion} rawMatch={sp.match}/>
      )}
      {!filtered && frequent.length > 0 && (
        <p className="meta">Also on the same team recently · {frequent.map(([name,games]) => `${name} (${games} games)`).join(", ")}</p>
      )}
      <OlderGames matches={history.matches} patch={patch} platform={player.platform} riotId={`${player.gameName}#${player.tagLine}`} persisted={!partial} lookupHref={lookupHref}
        rawPage={sp.older} rawMatch={sp.match} queueFilter={history.queue} championFilter={history.champion}/>

      <div id="player-champions" className={profileStyles.anchor}>
        <PlayerChampionAnalytics analytics={analytics} partial={incompleteHistory} patch={patch} visibleRooms={publicRooms}/>
      </div>
      <PlayerPerformance analytics={analytics} partial={incompleteHistory}/>
      <PlayerActivity analytics={analytics} partial={incompleteHistory}/>
      <div id="player-mastery" className={profileStyles.anchor}>
        <PlayerMastery mastery={player.championMastery} patch={patch} champions={masteryCatalog}/>
      </div>
      <div id="rank-history" className={profileStyles.anchor}>
        <PlayerRankHistory puuid={player.puuid} platform={platform}/>
      </div>
    </div>
  );
}
