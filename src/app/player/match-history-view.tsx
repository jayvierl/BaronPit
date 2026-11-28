import { ObjectiveTimeline } from "./objective-timeline";
import Link from "next/link";
import { cache, Suspense } from "react";
import { GameAssetIcon } from "@/components/game-asset-icon";
import { timeAgo } from "@/components/ui";
import { TeamBaronTag } from "@/components/team-baron-tag";
import { championAvatarArt } from "@/lib/avatar";
import { ratingExplanation } from "@/lib/match-performance";
import { buildCatalog } from "@/lib/build-catalog";
import { questionHref, type QuestionMatch } from "@/lib/decisions-input";
import { matchRegion } from "@/lib/match-context";
import { MATCH_DETAIL_LIMIT, matchQueueName, matchSectionId } from "@/lib/match-history";
import { groupMatchesByDay, type MatchDayGroup } from "@/lib/match-day-groups";
import { matchTags } from "@/lib/match-tags";
import { matchLoadout } from "@/lib/match-loadout";
import { isPlatform, playerStatsHref } from "@/lib/platforms";
import { isPublicMatchQueue } from "@/lib/public-match-queues";
import { gameCount, type MatchParticipantSummary, type MatchSummary } from "@/lib/pure";
import { MatchFragmentFocus } from "./match-fragment-focus";
import { MatchReviewCard } from "@/components/match-review-card";
import { anchoredMatchHref, matchFilterPath, olderMatchHref, olderMatchPage } from "./older-match-page";
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
  const elapsed = relative ? timeAgo(iso, true) : null;
  return <time dateTime={iso} title={label}>{elapsed ? elapsed === "now" ? "Played just now" : `Played ${elapsed} ago` : label}</time>;
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

function MatchRating({ player }: { player: Pick<MatchSummary, "performanceRating" | "ratingBadge"> }) {
  const { performanceRating: score, ratingBadge } = player;
  return <span className={styles.rating}>
    {score === undefined ? <span className={styles.unrated}>Not rated</span> : <>
      <span role="img" title="Baron Match Rating" aria-label={`Baron Match Rating ${score.toFixed(1)} out of 10`}><strong>{score.toFixed(1)}</strong><small>/10</small></span>
      {ratingBadge && <span className={styles.mvp}>{ratingBadge}</span>}
    </>}
  </span>;
}

function MatchTags({ match }: { match: MatchSummary }) {
  const tags = matchTags(match);
  if (!tags.length) return null;
  return <ul className={styles.tags} aria-label="Match highlights">
    {tags.map(tag => <li key={tag.id}>
      <span className={styles.tag} tabIndex={0} title={tag.reason}>{tag.label}<span className="sr-only">: {tag.reason}</span></span>
    </li>)}
  </ul>;
}

/** Compact both-teams list for the collapsed row. Purely a visual duplicate —
 * the same rosters are available accessibly in the expanded scoreboard — so
 * it is hidden from assistive tech. Names truncate here (and only here);
 * the scoreboard wraps them instead. */
function MiniTeams({ match }: { match: MatchSummary }) {
  if (!match.teams || match.queueId === 0) return null;
  return <div className={styles.miniTeams} aria-hidden="true">
    {[match.teams.allies, match.teams.opponents].map((players, side) => (
      <ul key={side} className={styles.miniTeam}>
        {players.map((player, index) => (
          <li key={index} className={styles.miniRow} data-viewed={player.isPlayer || undefined}>
            <MatchPortrait champion={player.champion} size={18}/>
            {/* Same display rule as the scoreboard: a name is shown only as
                part of a full Riot ID (name + tag); otherwise the champion. */}
            <span className={styles.miniName}>{player.name && player.tag ? player.name : player.champion}</span>
          </li>
        ))}
      </ul>
    ))}
  </div>;
}

function MatchGlance({ match, patch }: { match: MatchSummary; patch: string }) {
  const duration = Number.isFinite(match.durationSec) && match.durationSec >= 1 ? Math.floor(match.durationSec) : 0;
  const kp = match.killParticipation;
  const role = roles.get(match.role);
  const catalog = match.items.length ? loadCatalog(patch) : null;
  return <div className={styles.glance}>
    <div className={styles.glanceMain}>
      <div className={styles.gameSummary}>
        <MatchPortrait champion={match.champion} size={40}/>
        <div className={styles.gameInfo}>
          <p className={styles.championName}><strong>{match.champion}</strong><span>{role ?? "Role unavailable"}</span></p>
          <p className={styles.byline}><Result win={match.win}/> · {queue(match)}</p>
        </div>
        <Kda match={match}/>
        <MatchRating player={match}/>
      </div>
      <p className={styles.matchNumbers}>
        <span>{duration ? `Duration ${Math.floor(duration / 60)}m ${duration % 60}s` : "Duration unavailable"}</span>
        <MatchTime playedAt={match.playedAt} relative/>
        {Number.isFinite(match.cs) && <span>{match.cs} CS</span>}
        {kp != null && kp >= 0 && kp <= 1 && <span>{Math.round(kp * 100)}% KP</span>}
        {role === "Support" && match.vision != null
          ? <span>{match.vision} vision</span>
          : duration > 0 && Number.isFinite(match.cs) && <span>{(match.cs * 60 / duration).toFixed(1)} CS/min</span>}
      </p>
      {catalog && <Suspense fallback={null}><MatchItems ids={match.items} catalog={catalog}/></Suspense>}
      <MatchTags match={match}/>
      {match.performanceRating === undefined && <p className={styles.reason}>{ratingExplanation(match)}</p>}
    </div>
    <MiniTeams match={match}/>
  </div>;
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

function ParticipantDamage({ player }: { player: MatchParticipantSummary }) {
  // Unavailable damage is an em dash, never a zero: the two mean different
  // things and the stored data keeps them distinct.
  if (player.damage == null) return <span className={styles.damageCell} aria-label="Damage unavailable">—</span>;
  return <span className={styles.damageCell}>
    <span>{(player.damage / 1000).toFixed(1)}k dmg</span>
    {player.damageShare != null && <span className={styles.damageShare}>{Math.round(player.damageShare * 100)}%<span className="sr-only"> of team damage</span></span>}
  </span>;
}

function Teams({ match, platform, fromMatch }: { match: MatchSummary; platform: string; fromMatch: string }) {
  if (!match.teams || match.queueId === 0) return <p className="meta">Full team details unavailable for this match.</p>;
  const teams = [{ label: "Allied team", players: match.teams.allies }, { label: "Opposing team", players: match.teams.opponents }];
  return <div className={styles.teams}>
    {teams.map(({ label, players }) => (
      <div key={label} className={styles.teamPanel}>
        <h4>{label}</h4>
        <div className={`${styles.scoreRow} ${styles.scoreHead}`} aria-hidden="true">
          <span>Player</span><span className={styles.damageCell}>Damage</span><span className={styles.ratingCell}>Rating</span>
        </div>
        <ul className={styles.teamMembers}>
          {players.map((player, index) => <li key={index} className={styles.scoreRow} data-viewed={player.isPlayer || undefined}>
            <span className={styles.playerCell}>
              <Participant player={player} platform={platform} fromMatch={fromMatch}/>
            </span>
            <ParticipantDamage player={player}/>
            <span className={styles.ratingCell}><MatchRating player={player}/></span>
          </li>)}
        </ul>
      </div>
    ))}
  </div>;
}

function MatchDayHeader({ group }: { group: MatchDayGroup }) {
  return <h3 className={styles.dayHeader}>
    <span>{group.label}</span>
    {group.winRate !== null && <span className={styles.dayRecord}>{group.wins}W–{group.losses}L · {group.winRate}% win rate</span>}
  </h3>;
}

type MatchRowProps = {
  match: MatchSummary; patch: string; platform: string; lookupHref: string;
  discussion?: Pick<QuestionMatch, "platform" | "riotId">;
  expanded?: boolean; timeline?: boolean;
};

function MatchRow({ match, patch, platform, lookupHref, expanded, discussion, timeline }: MatchRowProps) {
  const matchId = matchSectionId(match.matchId);
  const reference = discussion && matchRegion(match.matchId) && isPublicMatchQueue(match.queueId)
    ? { ...discussion, matchId: match.matchId } : null;
  const matchPlatform = match.matchId.split("_", 1)[0].toLowerCase();
  const participantPlatform = isPlatform(matchPlatform) ? matchPlatform : platform;
  const from = new URL(lookupHref, "https://profile.invalid");
  from.searchParams.delete("fromPlayer");
  if (matchId) from.hash = matchId;
  const matchPath = from.pathname + from.search + from.hash;
  // The copied share link must reopen this exact match expanded, so it pins
  // the `match` parameter itself instead of inheriting whatever the current
  // page URL happens to carry (matchPath above stays the return context for
  // Discuss and participant links).
  const sharePath = anchoredMatchHref(matchPath, match.matchId);
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
  const participation = match.killParticipation;
  const killParticipation = participation != null && Number.isFinite(participation) && participation >= 0 && participation <= 1
    ? `${Math.round(participation * 100)}% P/Kill` : null;
  return <div id={matchId} tabIndex={-1} className={`${styles.matchTarget} ${styles.game}`}>
    <MatchGlance match={match} patch={patch}/>
    <details className={styles.gameDetails} open={expanded || undefined}>
      <summary>Match details<span className="sr-only"> for {match.champion} · <MatchTime playedAt={match.playedAt}/></span></summary>
      {/* The review card sits above the scoreboard. On the anchored
          (expanded) row it also carries the Discuss action, so the row never
          shows two identical links; on other rows the standalone Discuss
          link below the details stays the single entry point. */}
      <MatchReviewCard match={match}
        discussHref={expanded && reference ? questionHref(reference, undefined, { discuss: true, fromMatch: matchPath }) : undefined}
        sharePath={isPublicMatchQueue(match.queueId) ? sharePath : undefined}/>
      <Teams match={match} platform={participantPlatform} fromMatch={fromMatch}/>
      {match.performanceRating !== undefined && <p className={styles.scoreReason}><strong>Why this score?</strong> {ratingExplanation(match)}</p>}
      <p className={styles.matchNumbers}>
        {match.championLevel != null && <span>Level {match.championLevel}</span>}
        <span>{match.deaths > 0 ? `${((match.kills + match.assists) / match.deaths).toFixed(2)} KDA` : "No deaths"}</span>
        <span>{match.cs} CS{duration ? ` (${(match.cs * 60 / duration).toFixed(1)} CS/m)` : ""}</span>
        {killParticipation && <span>{killParticipation}<span className="sr-only"> · Kill participation</span></span>}
        {match.gold != null && <span>{(match.gold / 1000).toFixed(1)}k gold</span>}
        {match.damage != null && <span>{(match.damage / 1000).toFixed(1)}k damage{match.teamDamageShare != null ? ` (${Math.round(match.teamDamageShare * 100)}% of team)` : ""}</span>}
        {match.damageTaken != null && <span>{(match.damageTaken / 1000).toFixed(1)}k damage taken</span>}
        {match.vision != null && <span>{match.vision} vision</span>}
        <TeamBaronTag match={match}/>
      </p>
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
    </details>
    {reference && !expanded && <Link className={styles.discuss} prefetch={false}
      href={questionHref(reference, undefined, { discuss: true, fromMatch: matchPath })}>Discuss this match</Link>}
  </div>;
}

type Catalog = ReturnType<typeof buildCatalog>;

async function MatchItems({ ids, catalog }: { ids: number[]; catalog: Catalog }) {
  const source = await catalog;
  return <ul className={styles.finalItems} aria-label="Final inventory">
    {ids.filter(id => Number.isSafeInteger(id) && id > 0).map((id, slot) => {
      const item = source.items.find(entry => entry.id === id);
      if (!item) return <li key={slot} className={styles.unrated}>Unlisted item {id}</li>;
      return <li key={slot}><Link prefetch={false} href={`/items/${id}`} aria-label={item.name} title={item.name}>
        <GameAssetIcon name={item.name} size={24} src={`https://ddragon.leagueoflegends.com/cdn/${source.patch}/img/item/${id}.png`}/>
        <span className="sr-only">{item.name}</span>
      </Link></li>;
    })}
  </ul>;
}

export function LatestGames({ matches, patch, platform, riotId, persisted, lookupHref, queueFilter, championFilter, roleFilter = "", rawMatch, showTimeline }: {
  matches: MatchSummary[]; patch: string; platform: string; riotId: string; persisted: boolean;
  lookupHref: string; queueFilter: string; championFilter: string; roleFilter?: string; rawMatch?: string; showTimeline?: boolean;
}) {
  const base = matchFilterPath(lookupHref, queueFilter, championFilter, roleFilter);
  const groups = groupMatchesByDay(matches.slice(0, MATCH_DETAIL_LIMIT));
  return groups.map(group => <div key={`${group.key}:${group.matches[0].matchId}`} className={styles.dayGroup}>
    <MatchDayHeader group={group}/>
    {group.matches.map(match => <MatchRow key={match.matchId} match={match} patch={patch} platform={platform} lookupHref={base} expanded={rawMatch === match.matchId} timeline={showTimeline && rawMatch === match.matchId}
      discussion={persisted && isPlatform(platform) ? { platform, riotId } : undefined}/>)}
  </div>);
}

export function OlderGames({ matches, patch, platform, riotId, persisted, lookupHref, rawPage, rawMatch, queueFilter, championFilter, roleFilter = "", showTimeline }: {
  matches: MatchSummary[]; patch: string; platform: string; riotId: string; persisted: boolean; lookupHref: string; rawPage?: string; rawMatch?: string; showTimeline?: boolean;
  queueFilter: string; championFilter: string; roleFilter?: string;
}) {
  const page = olderMatchPage(matches, rawPage, rawMatch);
  const base = matchFilterPath(lookupHref, queueFilter, championFilter, roleFilter);
  const key = `${base}:${page.page}:${page.selected ?? ""}`;
  const unavailable = typeof rawMatch === "string" && Boolean(matchSectionId(rawMatch)) && !matches.some(match => match.matchId === rawMatch);
  return <>
    {unavailable && <p className={styles.archiveRange} role="status">This match is unavailable in the current recent-match window or filters.</p>}
    {page.total > 0 && <details id="older-games" className={styles.archive} open={page.open || undefined} key={`archive:${key}`}>
      <summary>Show {gameCount(page.total)} more</summary>
      <p className={styles.archiveRange}>Older games {page.offset + 1}–{page.offset + page.matches.length} of {page.total}</p>
      {groupMatchesByDay(page.matches).map(group => <div key={`${group.key}:${group.matches[0].matchId}`} className={styles.dayGroup}>
        <MatchDayHeader group={group}/>
        {group.matches.map(match => page.selected === match.matchId
          ? <MatchRow key={match.matchId} match={match} patch={patch} platform={platform} lookupHref={olderMatchHref(base, page.page, match.matchId)} expanded timeline={showTimeline && rawMatch === match.matchId}
            discussion={persisted && isPlatform(platform) ? { platform, riotId } : undefined}/>
          : <div key={match.matchId} id={matchSectionId(match.matchId)} tabIndex={-1} className={`${styles.archiveRow} ${styles.matchTarget}`}>
            <MatchGlance match={match} patch={patch}/>
            <Link prefetch={false} href={olderMatchHref(base, page.page, match.matchId)} className={styles.archiveLink}>
              Details<span className="sr-only"> for {match.champion} · <MatchTime playedAt={match.playedAt}/></span>
            </Link>
          </div>)}
      </div>)}
      {page.pages > 1 && <nav className={styles.archiveNav} aria-label="Older match pages">
        {page.page > 1 && <Link prefetch={false} href={olderMatchHref(base, page.page - 1)}>Newer games</Link>}
        {page.page < page.pages && <Link prefetch={false} href={olderMatchHref(base, page.page + 1)}>Older games</Link>}
      </nav>}
    </details>}
    <MatchFragmentFocus key={`fragment:${key}`}/>
  </>;
}
