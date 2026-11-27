import type { Metadata } from "next";
import { PilotVisit } from "@/components/pilot-visit";
import { WinStreak } from "@/components/win-streak";
import { currentWinStreak } from "@/lib/current-win-streak";
import { Avatar } from "@/components/ui";
import Link from "next/link";
import Form from "next/form";
import { MATCH_DETAIL_LIMIT, matchQueueName, matchRoleLabel, matchSectionId, recentMatchHistory } from "@/lib/match-history";
import { RATING_DESCRIPTION, RATING_VERSION } from "@/lib/match-performance";
import { matchFilterPath } from "./older-match-page";
import { LatestGames, OlderGames } from "./match-history-view";
import { ChampionSummary } from "./champion-summary";
import styles from "./history.module.css";
import profileStyles from "./profile.module.css";
import { buildPlayerAnalytics, formComparison } from "@/lib/player-analytics";
import { buildPerformanceIndex, duoSynergy, formCurve, personalBests, type PoolGame } from "@/lib/performance-index";
import { performancePool } from "@/lib/performance-pool";
import { FormCurveSparkline, FormDeltas, PerformanceIndexCard, PersonalBestsSection } from "@/components/player-insights";
import { PlayerActivity, PlayerChampionAnalytics, PlayerPerformance, PlayerPlayStyle, PlayerRoleBreakdown, type ChampionSort } from "@/components/player-analytics";
import { masteryNeedsCatalog, PlayerMastery } from "@/components/player-mastery";
import { PlayerRankHistory } from "@/components/player-rank-history";
import { RefreshPlayer } from "@/components/refresh-player";
import { canOpenPlayerMention, mentionKey } from "@/lib/player-mentions";
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
import { PlayerRail } from "@/components/player-rail";
import { RecentResults } from "@/components/player-overview";
import { gameCount, earnedBadges } from "@/lib/pure";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Player Stats — League of Legends Ranked Stats & Match History Lookup",
  description: "Look up any League of Legends player's ranked stats on Baron Pit: recent match history, " +
    "champion performance, match ratings and performance trends across the last 20 games.",
  alternates: { canonical: "/player" },
};

export default async function PlayerPage({ searchParams }: {
  searchParams: Promise<{ platform?: string; riotId?: string; name?: string; tag?: string; force?: string; match?: string; older?: string; queue?: string; champion?: string; role?: string; csort?: string; cdir?: string; from?: string; fromPlayer?: string; fromDiscussion?: string; timeline?: string; via?: string; playerKey?: string }>;
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
      <div className={profileStyles.lookup}>
        {discussionLink || searchLink}
        <div>
          <h1 className="page-title">Player Stats</h1>
          <p className="meta">{input ? "Enter the game name and tag from the Riot ID. For example, Jay Lewis#NA1." : "Search by Riot ID to see rank and recent games."}</p>
          {lookupForm}
        </div>
      </div>
    );
  }

  const session = getCurrentUser().catch(() => undefined);
  const tagUnavailable = () => <div className={profileStyles.lookup}>
    <h1 className="page-title">Player tag unavailable</h1>
    <p className="meta">This player record is unavailable to view.</p>
    {lookupForm}
  </div>;
  if (sp.via === "mention") {
    const viewer = await session;
    const available = viewer !== undefined && await canOpenPlayerMention(viewer?.id ?? null, platform, name, tag, sp.playerKey).catch(() => false);
    if (!available) return tagUnavailable();
  }
  const [result,patch,user] = await Promise.all([
    lookupPlayer(platform, name, tag, { profile: true, force: sp.force === "1" }),
    currentPatch(), session,
  ]);
  if (!result.ok) {
    const text =
      result.code === "not_found" ? `No player named ${name}#${tag} on ${platform.toUpperCase()}. Check the spelling and the #tag.`
      : result.code === "key_unavailable" || result.code === "invalid_key" ? "Live player lookup is temporarily unavailable. Please try again later."
      : result.code === "rate_limited" ? "Riot is limiting lookups. Wait a moment before trying again."
      : result.code === "unavailable" ? "We couldn’t open saved player records. Please try again shortly."
      : "The Riot API didn't answer just now. Try again in a moment.";
    return (
      <div className={profileStyles.lookup}>
        {discussionLink || searchLink}
        <div>
          <h1 className="page-title">Player Stats</h1>
          <div className="notice warn">{discussionId ? `This match link couldn’t open the player’s history. ${text}` : text}</div>
          {lookupForm}
          <Link className={styles.searchLink} href={searchHref("players", input, platform, true)}>Search saved player records</Link>
        </div>
      </div>
    );
  }

  const player = result.player;
  // The cached ID could have been reassigned while Riot refreshed the lookup.
  if (sp.via === "mention" && mentionKey(player.puuid) !== sp.playerKey) return tagUnavailable();
  const partial = result.source === "partial";
  const snap = player.snapshot;
  const matches = player.matchHistory?.matches ?? snap.matches;
  const analytics = buildPlayerAnalytics(matches, undefined, { excludeEarlySurrenders: true });
  const incompleteHistory = partial || player.matchHistory?.complete === false;
  const [linked,owner,roomSlugs,masteryCatalog] = await Promise.all([
    user ? q`SELECT 1 FROM wp_links WHERE user_id=${user.id} AND puuid=${player.puuid}`.catch(() => null) : null,
    user === undefined ? null : publicRiotOwner(player.puuid, user?.id ?? null).catch(() => null),
    visibleChampionRoomSlugs(analytics.champions.map(entry => entry.id)).catch(() => []),
    masteryNeedsCatalog(player.championMastery) ? championList() : [],
  ]);
  const publicRooms = new Set(roomSlugs);
  const allowLink = linked?.length === 0 && !partial;
  const canOpenMatchContext = !partial && user !== undefined;
  const badges = earnedBadges(snap);
  const streak = partial ? null : currentWinStreak(snap, player.fetchedAt);
  const history = recentMatchHistory(matches, sp.queue, sp.champion, sp.role);
  const publicSample = gameCount(history.sampleSize, "public");
  const latest = history.matches.slice(0, MATCH_DETAIL_LIMIT);
  const filtered = Boolean(history.queue || history.champion || history.role);
  const championSort: ChampionSort | undefined = sp.csort || sp.cdir ? {
    key: (["games", "winrate", "kda", "cs", "rating", "damage"] as const).find(key => key === sp.csort) ?? "games",
    dir: sp.cdir === "asc" ? "asc" : "desc",
    base: "",
  } : undefined;
  const route = new URL(withSearchReturn(playerStatsHref(player.platform, player.gameName + "#" + player.tagLine), searchReturn), "https://lookup.invalid");
  if (sp.via === "mention" && sp.playerKey) {
    route.searchParams.set("via", "mention");
    route.searchParams.set("playerKey", sp.playerKey);
  }
  if (playerReturn) route.searchParams.set("fromPlayer", playerReturn);
  if (discussionId) route.searchParams.set("fromDiscussion", String(discussionId));
  const lookupHref = route.pathname + route.search;
  if (history.queue) route.searchParams.set("queue", history.queue);
  if (history.champion) route.searchParams.set("champion", history.champion);
  if (history.role) route.searchParams.set("role", history.role);
  if (championSort) {
    route.searchParams.set("csort", championSort.key);
    route.searchParams.set("cdir", championSort.dir);
  }
  if (typeof sp.match === "string" && matchSectionId(sp.match)) route.searchParams.set("match", sp.match);
  if (typeof sp.older === "string" && /^\d{1,3}$/.test(sp.older)) route.searchParams.set("older", sp.older);
  const refreshHref = route.pathname + route.search;
  if (championSort) championSort.base = refreshHref;
  const historyHref = `${lookupHref}#match-history`;
  // The form strip reflects the same filtered sample the history shows.
  const formPath = filtered ? matchFilterPath(lookupHref, history.queue, history.champion, history.role)
    : sp.match || sp.older ? lookupHref : "";

  // Match history establishes shared games only. Older snapshots have names without tags.
  const mateCounts = new Map<string,number>();
  for (const game of snap.matches.slice(0,3)) {
    if (game.queueId === 0) continue;
    const teammates = new Set((game.teammates ?? []).filter(t => t.name && t.tag).map(t => `${t.name}#${t.tag}`));
    for (const id of teammates) mateCounts.set(id,(mateCounts.get(id) ?? 0) + 1);
  }
  const frequent = [...mateCounts].filter(([,games]) => games >= 2);
  // Retention layer over the same last-20 window. The percentile pool is a
  // cached sample of other stored snapshots; any failure simply hides the
  // index — bests, form and duo records are computed from this player alone.
  const insightWindow = matches.slice(0, 20);
  const pool: PoolGame[] = await performancePool(user?.id ?? null).catch(() => []);
  const performanceIndex = buildPerformanceIndex(insightWindow, pool);
  const bests = personalBests(insightWindow);
  const form = formCurve(insightWindow);
  const duo = duoSynergy(insightWindow);
  const comparison = formComparison(matches);
  return (
    <div className={`player-page ${profileStyles.profile}`}>
      {user?.pilotActive && <PilotVisit kind="stats"/>}
      {discussionLink || searchLink || <Link className={styles.searchLink} href={searchHref("players", "", platform)}>Search for another player</Link>}
      <header className={profileStyles.header}>
        <div className={profileStyles.identity}>
          <div className={profileStyles.identityText}>
            <h1 className="profile-name">{player.gameName}<span className={profileStyles.tag}>#{player.tagLine}</span></h1>
            <p className="meta">
              {platform.toUpperCase()}{player.summonerLevel > 0 && ` · Level ${player.summonerLevel}`}
              {streak && <> · <WinStreak wins={streak}/></>}
            </p>
            {owner && <p className="meta">Verified <Link href={withSearchReturn(`/u/${owner.id}`, searchReturn)}>{owner.name}<span className="sr-only">, community profile</span></Link>
              {" · "}<Link href={withSearchReturn(`/u/${owner.id}?tab=discussions`, searchReturn)} prefetch={false}>Match discussions</Link></p>}
          </div>
          <Avatar name={player.gameName} hue={265} size={64} imageUrl={profileIconUrl(patch, player.profileIcon)} />
        </div>
        <RefreshPlayer href={refreshHref} fetchedAt={player.fetchedAt} source={result.source} retryAt={result.retryAt} requested={sp.force === "1"} />
        {user && allowLink && <LinkPlayerButton platform={platform} gameName={player.gameName} tagLine={player.tagLine} />}
      </header>
      <div id="summary" className={profileStyles.anchor}>
        <PlayerStats player={player} source={result.source} variant="profile" />
        <RecentResults matches={history.matches} historyPath={formPath} partial={partial} />
      </div>
      <div className={profileStyles.layout}>
      <PlayerRail analytics={analytics} partial={incompleteHistory} className={profileStyles.railCell} />
      <section className={`${styles.history} ${profileStyles.historyCell}`} aria-labelledby="match-history">
        <div className={styles.historyHeader}>
          <h2 id="match-history" className={styles.heading}>Match history</h2>
          {history.sampleSize > 0 && <nav aria-label="Quick queue filters" className={styles.quickFilters}>
            {[["", "All"], ["ranked", "Ranked"]].map(([queue, label]) => (
              <Link key={label} href={matchFilterPath(lookupHref, queue, history.champion, history.role) + "#match-history"}
                aria-current={history.queue === queue ? "page" : undefined} prefetch={false}>{label}</Link>
            ))}
          </nav>}
          {history.sampleSize > 0 && <details className={styles.filterDisclosure} open={filtered || undefined}>
            <summary>Filters</summary>
              <Form action="/player#match-history" className={styles.filters} key={JSON.stringify([platform, player.gameName, player.tagLine, history.queue, history.champion, history.role])}>
                <input type="hidden" name="platform" value={platform}/>
                <input type="hidden" name="riotId" value={player.gameName + "#" + player.tagLine}/>
                {sp.via === "mention" && sp.playerKey && <>
                  <input type="hidden" name="via" value="mention"/><input type="hidden" name="playerKey" value={sp.playerKey}/>
                </>}
                {searchReturn && <input type="hidden" name="from" value={searchReturn}/>}
                {playerReturn && <input type="hidden" name="fromPlayer" value={playerReturn}/>}
                {discussionId && <><input type="hidden" name="fromDiscussion" value={discussionId}/><input type="hidden" name="match" value={sp.match}/></>}
                <label>Queue<select name="queue" defaultValue={history.queue}>
                  <option value="">All supported queues</option>
                  <option value="ranked">{matchQueueName("ranked")}</option>
                  {history.queue && history.queue !== "ranked" && !history.queues.includes(history.queue) && <option value={history.queue}>Outside this sample</option>}
                  {history.queues.map(q => <option key={q} value={q}>{matchQueueName(q)}</option>)}
                </select></label>
                <label>Champion<select name="champion" defaultValue={history.champion}>
                  <option value="">All champions</option>
                  {history.champion && !history.champions.includes(history.champion) && <option value={history.champion}>Outside this sample</option>}
                  {history.champions.map(c => <option key={c} value={c}>{c}</option>)}
                </select></label>
                <label>Role<select name="role" defaultValue={history.role}>
                  <option value="">All roles</option>
                  {history.role && !(history.roles as readonly string[]).includes(history.role) && <option value={history.role}>{matchRoleLabel(history.role)} · outside this sample</option>}
                  {history.roles.map(r => <option key={r} value={r}>{matchRoleLabel(r)}</option>)}
                </select></label>
                <button className="btn secondary small">Apply</button>
              </Form>
          </details>}
        </div>
        {history.sampleSize > 0 && <p className={styles.result} aria-live="polite">
          {history.winRate === null ? `No matching games among the ${incompleteHistory ? "available" : "latest"} ${publicSample}` : <>
            {filtered ? `${history.matches.length} of ${publicSample}` : incompleteHistory ? `${publicSample} available` : `Latest ${publicSample}`}
            {" · "}{history.wins}W–{history.losses}L · {history.winRate}% win rate
          </>}
          {history.excluded > 0 && <> · {history.excluded} remake or early surrender {history.excluded === 1 ? "game" : "games"} not counted</>}
          {filtered && <Link href={historyHref} className={styles.reset}>Clear filters</Link>}
        </p>}
        {history.sampleSize === 0 && !discussionId && <p className="meta">{partial ? "Riot couldn’t provide recent public games for this lookup." : "No recent public games in this lookup."}</p>}
        {latest.length > 0 && (
          <LatestGames matches={latest} patch={patch} platform={player.platform} riotId={`${player.gameName}#${player.tagLine}`}
            persisted={canOpenMatchContext} lookupHref={lookupHref}
            queueFilter={history.queue} championFilter={history.champion} roleFilter={history.role} rawMatch={sp.match} showTimeline={sp.timeline === "objectives"}/>
        )}
        <OlderGames matches={history.matches} patch={patch} platform={player.platform} riotId={`${player.gameName}#${player.tagLine}`} persisted={canOpenMatchContext} lookupHref={lookupHref}
          rawPage={sp.older} rawMatch={sp.match} showTimeline={sp.timeline === "objectives"} queueFilter={history.queue} championFilter={history.champion} roleFilter={history.role}/>

        {history.sampleSize > 0 && <details className={styles.ratingGuide}>
          <summary>How match ratings work</summary>
          <p>Baron Match Rating v{RATING_VERSION} · {RATING_DESCRIPTION}</p>
          <p>Remakes, early surrenders and games with insufficient evidence are unrated.</p>
        </details>}
      </section>
      <ChampionSummary analytics={analytics} patch={patch} partial={incompleteHistory} championsHref={`${lookupHref}#player-champions`} className={profileStyles.summaryCell} />
      </div>

      <details className={profileStyles.disclosure}>
        <summary>Insights</summary>
        {performanceIndex
          ? <PerformanceIndexCard index={performanceIndex} bests={bests} bestBaseHref={lookupHref} partial={partial} />
          : <PersonalBestsSection bests={bests} bestBaseHref={lookupHref} partial={partial} />}
        {form && <FormCurveSparkline form={form} />}
        <FormDeltas comparison={comparison} />
        <PlayerRoleBreakdown analytics={analytics} partial={incompleteHistory} />
        <PlayerPerformance analytics={analytics} partial={incompleteHistory} />
        <PlayerActivity analytics={analytics} partial={incompleteHistory} />
        {badges.length > 0 && <p className="meta">{badges.join(" · ")}</p>}
        {duo && <p className="meta">Duo record · You + {duo.name}#{duo.tag}: {duo.wins}W–{duo.losses}L together across {duo.games} recent games</p>}
        {frequent.length > 0 && <p className="meta">Also on the same team recently · {frequent.map(([name,games]) => `${name} (${games} games)`).join(", ")}</p>}
      </details>
      <details className={profileStyles.disclosure}>
        <summary>Champions and roles</summary>
        <div id="player-champions" className={profileStyles.anchor}>
          <PlayerChampionAnalytics analytics={analytics} partial={incompleteHistory} patch={patch} visibleRooms={publicRooms} sort={championSort}/>
          <PlayerPlayStyle analytics={analytics} partial={incompleteHistory}/>
        </div>
      </details>
      <details className={profileStyles.disclosure}>
        <summary>Champion mastery</summary>
        <div id="player-mastery" className={profileStyles.anchor}>
          <PlayerMastery mastery={player.championMastery} patch={patch} champions={masteryCatalog}/>
        </div>
      </details>
      <details className={profileStyles.disclosure}>
        <summary>Rank history</summary>
        <div id="rank-history" className={profileStyles.anchor}>
          <PlayerRankHistory puuid={player.puuid} platform={platform}/>
        </div>
      </details>
    </div>
  );
}
