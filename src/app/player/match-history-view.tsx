import { ObjectiveTimeline } from "./objective-timeline";
import Link from "next/link";
import { cache, Suspense } from "react";
import { GameAssetIcon } from "@/components/game-asset-icon";
import { ItemIcons } from "@/components/item-icons";
import { TeamBaronTag } from "@/components/team-baron-tag";
import { timeAgo } from "@/components/ui";
import { championAvatarArt } from "@/lib/avatar";
import { APP_NAME } from "@/lib/brand";
import { buildCatalog, cardItems } from "@/lib/build-catalog";
import { questionHref, type QuestionMatch } from "@/lib/decisions-input";
import { matchRegion } from "@/lib/match-context";
import { MATCH_DETAIL_LIMIT, matchQueueName, matchSectionId } from "@/lib/match-history";
import { matchLoadout } from "@/lib/match-loadout";
import { isPlatform, playerStatsHref } from "@/lib/platforms";
import { isPublicMatchQueue } from "@/lib/public-match-queues";
import { gameCount, type MatchParticipantSummary, type MatchSummary } from "@/lib/pure";
import { MatchFragmentFocus } from "./match-fragment-focus";
import { matchFilterPath, olderMatchHref, olderMatchPage } from "./older-match-page";
import styles from "./history.module.css";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const roles = new Map([["TOP", "Top"], ["JUNGLE", "Jungle"], ["MIDDLE", "Mid"], ["MID", "Mid"],
  ["BOTTOM", "Bot"], ["ADC", "Bot"], ["UTILITY", "Support"], ["SUPPORT", "Support"]]);
const loadCatalog = cache(buildCatalog);

function MatchPortrait({ champion, size }: { champion: string; size: number }) {
  const art = championAvatarArt(champion);
  return <span className={styles.portrait} aria-hidden="true" style={{ width: size, height: size, ...art }}>
    {art ? null : champion.charAt(0).toUpperCase()}
  </span>;
}

function Result({ win }: { win: boolean }) {
  return <strong className={styles.outcome} data-win={win}>{win ? "Victory" : "Defeat"}</strong>;
}

function gameDate(playedAt: number) {
  const end = new Date(playedAt);
  return Number.isFinite(end.valueOf()) && playedAt > 0 ? end : undefined;
}

function MatchTime({ playedAt, relative = false }: { playedAt: number; relative?: boolean }) {
  const end = gameDate(playedAt);
  if (!end) return <span>Date unavailable</span>;
  const iso = end.toISOString(), label = dateFormat.format(end);
  return <time dateTime={iso} title={label}>{relative ? timeAgo(iso) : label}</time>;
}

function queue(match: MatchSummary) {
  return matchQueueName(Number.isSafeInteger(match.queueId) && match.queueId >= 0 ? String(match.queueId) : "unknown");
}

function Kda({ match }: { match: MatchSummary }) {
  return <span className={styles.kda}>
    <strong aria-hidden="true">{match.kills}/{match.deaths}/{match.assists}</strong>
    <span className="sr-only">{match.kills} kills, {match.deaths} deaths, {match.assists} assists</span>
    <small aria-hidden="true">KDA</small>
  </span>;
}

function MatchRating({ rating }: { rating?: number }) {
  if (rating === undefined) return null;
  return <span className={styles.rating}>
    <span role="img" aria-label={`Match rating ${rating} out of 10`}><strong>{rating}</strong><small>/10</small></span>
    {rating === 10 && <span className={styles.mvp} title={`${APP_NAME} MVP · Highest rating in this match`}>MVP</span>}
  </span>;
}

function LoadoutGroup({ title, entries }: { title: string; entries: { name: string; icon?: string }[] }) {
  return <div>
    <h4>{title}</h4>
    {entries.length ? <ul className={styles.loadout}>
      {entries.map(({ name, icon }, index) => <li key={index}>
        {icon && <GameAssetIcon src={icon} size={20}/>}{name}
      </li>)}
    </ul> : <p className="meta">{title} unavailable for this match.</p>}
  </div>;
}

function Participant({ player, platform, fromMatch }: { player: MatchParticipantSummary; platform: string; fromMatch: string }) {
  const name = player.name && player.tag ? `${player.name}#${player.tag}` : null;
  return <>
    <MatchPortrait champion={player.champion} size={24}/>
    <span className={styles.participantName}>
      {name && !player.isPlayer ? <Link prefetch={false} href={`${playerStatsHref(platform, name)}&fromPlayer=${fromMatch}`}>{name}</Link>
        : <strong>{name ?? player.champion}</strong>}
      {name && <small>{player.champion}</small>}
      {player.isPlayer && <small className={styles.selectedPlayer}>Looked-up player</small>}
    </span>
  </>;
}

function Teams({ match, platform, fromMatch }: { match: MatchSummary; platform: string; fromMatch: string }) {
  if (!match.teams || match.queueId === 0) return <p className="meta">Full team details unavailable for this match.</p>;
  const teams = [{ label: "Allied team", players: match.teams.allies }, { label: "Opposing team", players: match.teams.opponents }];
  return <div className={styles.teams}>
    {teams.map(({ label, players }) => (
      <div key={label}>
        <h4>{label}</h4>
        <ul className={styles.teamMembers}>
          {players.map((player, index) => <li key={index}>
            <Participant player={player} platform={platform} fromMatch={fromMatch}/>
          </li>)}
        </ul>
      </div>
    ))}
  </div>;
}

type MatchRowProps = {
  match: MatchSummary; patch: string; platform: string; lookupHref: string;
  discussion?: Pick<QuestionMatch, "platform" | "riotId">;
  expanded?: boolean; timeline?: boolean;
};

function MatchRow({ match, patch, platform, lookupHref, expanded, discussion, timeline }: MatchRowProps) {
  const catalog = match.items.length ? loadCatalog(patch) : null;
  const matchId = matchSectionId(match.matchId);
  const reference = discussion && matchRegion(match.matchId) && isPublicMatchQueue(match.queueId)
    ? { ...discussion, matchId: match.matchId } : null;
  const matchPlatform = match.matchId.split("_", 1)[0].toLowerCase();
  const participantPlatform = isPlatform(matchPlatform) ? matchPlatform : platform;
  const from = new URL(lookupHref, "https://profile.invalid");
  from.searchParams.delete("fromPlayer");
  if (matchId) from.hash = matchId;
  const matchPath = from.pathname + from.search + from.hash;
  const timelineUrl = new URL(lookupHref, "https://profile.invalid");
  timelineUrl.searchParams.set("timeline", "objectives");
  timelineUrl.searchParams.set("match", match.matchId);
  if (matchId) timelineUrl.hash = matchId;
  const returnUrl = new URL(timelineUrl);
  returnUrl.searchParams.delete("timeline");
  const fromMatch = encodeURIComponent(matchPath);
  const { spells, runes } = matchLoadout(match);
  const legacyTeam = !match.teams && match.queueId !== 0 ? match.teammates ?? [] : [];
  const duration = Number.isFinite(match.durationSec) && match.durationSec >= 1 ? Math.floor(match.durationSec) : undefined;
  const role = roles.get(match.role);
  const participation = match.killParticipation;
  const killParticipation = participation != null && Number.isFinite(participation) && participation >= 0 && participation <= 1
    ? `${Math.round(participation * 100)}% P/Kill` : null;
  return <div id={matchId} tabIndex={-1} className={`${styles.matchTarget} ${styles.game}`}>
    <div className={styles.gameSummary}>
      <MatchPortrait champion={match.champion} size={42}/>
      <div className={styles.gameInfo}>
        <p className={styles.championName}><strong>{match.champion}</strong><Result win={match.win}/></p>
        <p className={styles.byline}>{queue(match)} <span aria-hidden="true">·</span> <MatchTime playedAt={match.playedAt} relative/></p>
      </div>
      <Kda match={match}/>
      <MatchRating rating={match.performanceRating}/>
    </div>
    {reference && <Link className={styles.discuss} prefetch={false}
      href={questionHref(reference, undefined, { discuss: true, fromMatch: matchPath })}>Discuss this match</Link>}
    <details className={styles.gameDetails} open={expanded || undefined}>
      <summary>Match details<span className="sr-only"> for {match.champion} · <MatchTime playedAt={match.playedAt}/></span></summary>
      <p className={styles.matchNumbers}>
        {duration && <span>{Math.floor(duration / 60)}m {duration % 60}s</span>}
        {role && <span>{role}</span>}
        {match.championLevel != null && <span>Level {match.championLevel}</span>}
        <span>{match.deaths > 0 ? `${((match.kills + match.assists) / match.deaths).toFixed(2)} KDA` : "No deaths"}</span>
        <span>{match.cs} CS{duration ? ` (${(match.cs * 60 / duration).toFixed(1)} CS/m)` : ""}</span>
        {killParticipation && <span>{killParticipation}<span className="sr-only"> · Kill participation</span></span>}
        {match.gold != null && <span>{(match.gold / 1000).toFixed(1)}k gold</span>}
        <TeamBaronTag match={match}/>
      </p>
      {catalog && <Suspense fallback={null}><MatchItems ids={match.items} catalog={catalog}/></Suspense>}
      {legacyTeam.length > 0 && <div className={styles.legacyTeam}>
        <span className="meta">Played with</span>
        <ul>{legacyTeam.map((player, index) => <li key={index}>
          <Participant player={player} platform={participantPlatform} fromMatch={fromMatch}/>
        </li>)}</ul>
      </div>}
      <div className={styles.loadoutGroups}>
        <LoadoutGroup title="Summoner spells" entries={spells}/>
        <LoadoutGroup title="Runes" entries={runes}/>
      </div>
      {(!killParticipation || match.championLevel == null || !duration || !match.items.length) && <p className="meta">
        {[
          !killParticipation && "Kill participation unavailable", match.championLevel == null && "Champion level unavailable",
          !duration && "Duration and CS/m unavailable", !match.items.length && "No item build recorded",
        ].filter(Boolean).join(" · ")}
      </p>}
      {reference && (timeline ? <ObjectiveTimeline reference={reference} returnHref={returnUrl.pathname + returnUrl.search + returnUrl.hash}/> :
        <Link className={styles.timelineLink} prefetch={false} href={timelineUrl.pathname + timelineUrl.search + timelineUrl.hash}>View objective timeline</Link>)}
      <Teams match={match} platform={participantPlatform} fromMatch={fromMatch}/>
    </details>
  </div>;
}

type Catalog = ReturnType<typeof buildCatalog>;

async function MatchItems({ ids, catalog }: { ids: number[]; catalog: Catalog }) {
  const source = await catalog;
  return <ItemIcons ids={ids} details={cardItems(source, ids)} patch={source.patch}/>;
}

export function LatestGames({ matches, patch, platform, riotId, persisted, lookupHref, queueFilter, championFilter, rawMatch, showTimeline }: {
  matches: MatchSummary[]; patch: string; platform: string; riotId: string; persisted: boolean;
  lookupHref: string; queueFilter: string; championFilter: string; rawMatch?: string; showTimeline?: boolean;
}) {
  const base = matchFilterPath(lookupHref, queueFilter, championFilter);
  return matches.slice(0, MATCH_DETAIL_LIMIT).map(match => <MatchRow key={match.matchId} match={match} patch={patch} platform={platform} lookupHref={base} expanded={rawMatch === match.matchId} timeline={showTimeline && rawMatch === match.matchId}
    discussion={persisted && isPlatform(platform) ? { platform, riotId } : undefined}/>);
}

export function OlderGames({ matches, patch, platform, riotId, persisted, lookupHref, rawPage, rawMatch, queueFilter, championFilter, showTimeline }: {
  matches: MatchSummary[]; patch: string; platform: string; riotId: string; persisted: boolean; lookupHref: string; rawPage?: string; rawMatch?: string; showTimeline?: boolean;
  queueFilter: string; championFilter: string;
}) {
  const page = olderMatchPage(matches, rawPage, rawMatch);
  const base = matchFilterPath(lookupHref, queueFilter, championFilter);
  const key = `${base}:${page.page}:${page.selected ?? ""}`;
  const unavailable = typeof rawMatch === "string" && Boolean(matchSectionId(rawMatch)) && !matches.some(match => match.matchId === rawMatch);
  return <>
    {unavailable && <p className={styles.archiveRange} role="status">This match is unavailable in the current recent-match window or filters.</p>}
    {page.total > 0 && <details id="older-games" className={styles.archive} open={page.open || undefined} key={`archive:${key}`}>
      <summary>Show {gameCount(page.total)} more</summary>
      <p className={styles.archiveRange}>Older games {page.offset + 1}–{page.offset + page.matches.length} of {page.total}</p>
      {page.matches.map(match => page.selected === match.matchId
        ? <MatchRow key={match.matchId} match={match} patch={patch} platform={platform} lookupHref={olderMatchHref(base, page.page, match.matchId)} expanded timeline={showTimeline && rawMatch === match.matchId}
          discussion={persisted && isPlatform(platform) ? { platform, riotId } : undefined}/>
        : <div key={match.matchId} id={matchSectionId(match.matchId)} tabIndex={-1} className={`${styles.archiveRow} ${styles.matchTarget}`}>
          <MatchPortrait champion={match.champion} size={32}/>
          <div className={styles.archiveIdentity}><strong>{match.champion}</strong> <Result win={match.win}/>
            <span className="meta">{queue(match)} · <MatchTime playedAt={match.playedAt}/></span>
          </div>
          <Kda match={match}/>
          <MatchRating rating={match.performanceRating}/>
          <Link prefetch={false} href={olderMatchHref(base, page.page, match.matchId)} className={styles.archiveLink}>
            Details<span className="sr-only"> for {match.champion} · <MatchTime playedAt={match.playedAt}/></span>
          </Link>
        </div>)}
      {page.pages > 1 && <nav className={styles.archiveNav} aria-label="Older match pages">
        {page.page > 1 && <Link prefetch={false} href={olderMatchHref(base, page.page - 1)}>Newer games</Link>}
        {page.page < page.pages && <Link prefetch={false} href={olderMatchHref(base, page.page + 1)}>Older games</Link>}
      </nav>}
    </details>}
    <MatchFragmentFocus key={`fragment:${key}`}/>
  </>;
}
