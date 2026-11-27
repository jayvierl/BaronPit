import { teamBaronFields, type MatchParticipantSummary, type MatchSummary } from "./pure";
import { eligibleForMatchRating, MATCH_DETAILS_VERSION, rateMatch, validRating, withTeamBadges } from "./match-performance";

const positions = new Set(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function positive(value: unknown): number | undefined {
  const parsed = count(value);
  return parsed && parsed > 0 ? parsed : undefined;
}

function championId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-z][a-z0-9]{0,39}$/i.test(value) ? value : undefined;
}

function riotName(value: unknown, max: number): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name.length <= max && !/[#\p{Cc}\p{Cf}]/u.test(name) ? name : undefined;
}

function publicParticipant(raw: Record<string, unknown>, live = false, actualPlayer = false, hideIdentity = false): MatchParticipantSummary | null {
  const champion = championId(live ? raw.championName : raw.champion);
  if (!champion) return null;
  const name = hideIdentity ? undefined : riotName(live ? raw.riotIdGameName : raw.name, 32);
  const tag = hideIdentity ? undefined : riotName(live ? raw.riotIdTagline : raw.tag, 16);
  return { champion, ...(name && tag ? { name, tag } : {}), ...(actualPlayer ? { isPlayer: true } : {}) };
}

function roster(raw: unknown, showPlayer: boolean, hideIdentity: boolean, rated: boolean, win: boolean): MatchParticipantSummary[] | undefined {
  if (!Array.isArray(raw) || raw.length !== 5) return undefined;
  const entries = raw.map(value => {
    const participant = object(value);
    const row = publicParticipant(participant, false, showPlayer && participant.isPlayer === true, hideIdentity);
    if (row && rated && validRating(participant.performanceRating)) row.performanceRating = participant.performanceRating;
    return row;
  });
  return entries.every((value): value is MatchParticipantSummary => value !== null) ? withTeamBadges(entries, win) : undefined;
}

function spellIds(first: unknown, second: unknown): MatchSummary["spellIds"] {
  const one = positive(first), two = positive(second);
  return one && two ? [one, two] : undefined;
}

function runes(raw: unknown): MatchSummary["runes"] {
  const data = object(raw);
  const keystone = positive(data.keystone), primaryStyle = positive(data.primaryStyle), secondaryStyle = positive(data.secondaryStyle);
  return keystone && primaryStyle && secondaryStyle && primaryStyle !== secondaryStyle
    ? { keystone, primaryStyle, secondaryStyle } : undefined;
}

function liveRunes(raw: unknown) {
  const styles = object(raw).styles;
  if (!Array.isArray(styles)) return undefined;
  const primary = styles.map(object).find(style => style.description === "primaryStyle");
  const secondary = styles.map(object).find(style => style.description === "subStyle");
  const selected = primary?.selections;
  return runes({ keystone: Array.isArray(selected) ? object(selected[0]).perk : undefined,
    primaryStyle: primary?.style, secondaryStyle: secondary?.style });
}

function killParticipation(teamKills: number | undefined, kills: number, assists: number): number | undefined {
  const takedowns = kills + assists;
  return teamKills && takedowns <= teamKills ? takedowns / teamKills : undefined;
}

/** Project only Match-V5 fields the UI and existing community evidence consume. */
export function matchFromRiot(raw: unknown, matchId: string, puuid: string, retainPrivateCustom = false): MatchSummary | null {
  const match = object(raw), info = object(match.info);
  if (object(match.metadata).matchId !== matchId || !Array.isArray(info.participants) || info.participants.length > 16) return null;
  const participants = info.participants.map(object);
  const candidates = participants.filter(player => player.puuid === puuid);
  const me = candidates[0];
  if (candidates.length !== 1 || typeof me.win !== "boolean") return null;
  const champion = championId(me.championName), kills = count(me.kills), deaths = count(me.deaths), assists = count(me.assists);
  const laneCs = count(me.totalMinionsKilled), monsterCs = count(me.neutralMinionsKilled);
  const durationSec = count(info.gameDuration), queueId = count(info.queueId), playedAt = positive(info.gameEndTimestamp);
  if (!champion || kills === undefined || deaths === undefined || assists === undefined || laneCs === undefined || monsterCs === undefined ||
      durationSec === undefined || queueId === undefined || playedAt === undefined) return null;

  const teamId = positive(me.teamId);
  const team = teamId ? participants.filter(player => player.teamId === teamId) : [];
  const opponents = teamId === 100 || teamId === 200 ? participants.filter(player => player.teamId === (teamId === 100 ? 200 : 100)) : [];
  const opposingLane = positions.has(String(me.teamPosition)) ? opponents.filter(player => player.teamPosition === me.teamPosition) : [];
  const objectives = Array.isArray(info.teams) && teamId
    ? object(info.teams.map(object).find(side => side.teamId === teamId)?.objectives) : {};
  const ratings = rateMatch(participants, queueId, durationSec, info.mapId);
  function row(player: Record<string, unknown>) {
    const entry = publicParticipant(player, true, player === me, queueId === 0);
    if (entry && "rows" in ratings) entry.performanceRating = ratings.rows[participants.indexOf(player)].score;
    return entry;
  }
  const allies = team.map(row);
  const rivals = opponents.map(row);
  const fullRosters = allies.length === 5 && rivals.length === 5 && participants.length === 10;
  const teams = fullRosters && allies.every(entry => entry !== null) && rivals.every(entry => entry !== null)
    ? { allies: withTeamBadges(allies, me.win), opponents: withTeamBadges(rivals, !me.win) } : undefined;
  const ratedPlayer = teams?.allies.find(p => p.isPlayer);
  const killsPerPlayer = team.map(player => count(player.kills));
  const goldPerPlayer = team.map(player => count(player.goldEarned));
  const teamKills = count(object(objectives.champion).kills)
    ?? (fullRosters && killsPerPlayer.every(n => n !== undefined) ? killsPerPlayer.reduce((sum, n) => sum + n, 0) : undefined);
  const teamGold = team.length && goldPerPlayer.every(n => n !== undefined)
    ? goldPerPlayer.reduce((sum, n) => sum + n, 0) : undefined;
  const startedAt = positive(info.gameStartTimestamp);
  const items = Array.from({ length: 7 }, (_, index) => positive(me[`item${index}`])).filter(id => id !== undefined);
  return {
    matchId, champion, win: me.win, kills, deaths, assists, cs: laneCs + monsterCs, durationSec, queueId,
    playedAt, startedAt: startedAt && startedAt <= playedAt ? startedAt : undefined,
    role: positions.has(String(me.teamPosition)) ? String(me.teamPosition) : "",
    opponentChampion: opposingLane.length === 1 ? championId(opposingLane[0].championName) : undefined,
    gamePatch: typeof info.gameVersion === "string" ? /^([1-9]\d?\.[1-9]\d?)(?:\.|$)/.exec(info.gameVersion)?.[1] : undefined,
    items, gold: count(me.goldEarned), teamGold, ...teamBaronFields({ teamBaronKills: object(objectives.baron).kills }),
    // The existing accepted-duo SQL uses the current 20's same-team evidence.
    // Custom identities do not enter public rosters or the older profile tail.
    teammates: team.flatMap(entry => {
      const participant = entry !== me && publicParticipant(entry, true, false, queueId === 0 && !retainPrivateCustom);
      return participant ? [{ champion: participant.champion, name: participant.name ?? "", tag: participant.tag }] : [];
    }),
    championLevel: positive(me.champLevel), spellIds: spellIds(me.summoner1Id, me.summoner2Id), runes: liveRunes(me.perks),
    teamKills, killParticipation: killParticipation(teamKills, kills, assists), teams, detailsVersion: MATCH_DETAILS_VERSION,
    vision: count(me.visionScore), performanceRating: ratedPlayer?.performanceRating, ratingBadge: ratedPlayer?.ratingBadge,
    ratingReason: "reason" in ratings ? ratings.reason : ratedPlayer ? ratings.rows[participants.indexOf(me)].reason : undefined,
  };
}

/** Older cache rows remain usable; malformed optional fields do not leak into profiles. */
export function readStoredMatches(raw: unknown, limit: number, existing: readonly MatchSummary[] = [], retainPrivateCustom = false): MatchSummary[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(existing.map(match => match.matchId));
  const matches: MatchSummary[] = [];
  for (const value of raw.slice(0, limit)) {
    const m = object(value) as unknown as MatchSummary;
    if (typeof m.matchId !== "string" || !m.matchId || seen.has(m.matchId) || !championId(m.champion) || typeof m.win !== "boolean" ||
        [m.kills, m.deaths, m.assists, m.cs, m.durationSec, m.playedAt].some(n => count(n) === undefined)) continue;
    seen.add(m.matchId);
    const rated = m.detailsVersion === MATCH_DETAILS_VERSION && eligibleForMatchRating(m.queueId, m.durationSec);
    const allies = roster(m.teams?.allies, true, m.queueId === 0, rated, m.win);
    const opponents = roster(m.teams?.opponents, false, m.queueId === 0, rated, !m.win);
    const teams = allies && opponents && allies.filter(player => player.isPlayer).length === 1 ? { allies, opponents } : undefined;
    const ratedPlayer = teams?.allies.find(p => p.isPlayer);
    const teamKills = count(m.teamKills);
    const items = Array.isArray(m.items) ? m.items.slice(0, 7).map(positive).filter(id => id !== undefined) : [];
    const teammates = Array.isArray(m.teammates) ? m.teammates.slice(0, 15).flatMap(value => {
      const entry = object(value), champion = championId(entry.champion);
      if (!champion) return [];
      return m.queueId === 0 && !retainPrivateCustom ? [{ champion, name: "" }]
        : [{ champion, name: riotName(entry.name, 32) ?? "", tag: riotName(entry.tag, 16) }];
    }) : [];
    matches.push({
      matchId: m.matchId, champion: m.champion, win: m.win, kills: m.kills, deaths: m.deaths, assists: m.assists, cs: m.cs,
      durationSec: m.durationSec, queueId: m.queueId, role: typeof m.role === "string" ? m.role : "", playedAt: m.playedAt,
      startedAt: positive(m.startedAt) && m.startedAt! <= m.playedAt ? m.startedAt : undefined,
      gamePatch: typeof m.gamePatch === "string" && /^\d{1,2}\.\d{1,2}$/.test(m.gamePatch) ? m.gamePatch : undefined,
      opponentChampion: championId(m.opponentChampion), items, gold: count(m.gold), teamGold: count(m.teamGold),
      ...teamBaronFields(m), teammates, championLevel: positive(m.championLevel),
      spellIds: spellIds(m.spellIds?.[0], m.spellIds?.[1]), runes: runes(m.runes),
      teamKills, killParticipation: killParticipation(teamKills, m.kills, m.assists), teams,
      performanceRating: ratedPlayer?.performanceRating, ratingBadge: ratedPlayer?.ratingBadge, vision: count(m.vision),
      ratingReason: m.detailsVersion === MATCH_DETAILS_VERSION && typeof m.ratingReason === "string" ? m.ratingReason.slice(0, 180) : undefined,
      detailsVersion: m.detailsVersion === 1 || m.detailsVersion === 2 || m.detailsVersion === MATCH_DETAILS_VERSION ? m.detailsVersion : undefined,
    });
  }
  return matches;
}
