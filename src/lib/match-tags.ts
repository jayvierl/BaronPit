import { isEarlySurrender } from "./match-performance";
import type { MatchSummary } from "./pure";

export type MatchTag = { id: string; label: string; reason: string };

const MAX_TAGS = 3;
const FARMING_ROLES = new Set(["TOP", "MIDDLE", "BOTTOM"]);

function durationText(durationSec: number) {
  const total = Math.floor(durationSec);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

function kda(match: MatchSummary) {
  return match.deaths > 0 ? (match.kills + match.assists) / match.deaths : null;
}

/**
 * Playful per-match flavor labels, computed only from the searched player's
 * stored match line. A tag can only fire on data the snapshot actually
 * recorded — nothing is estimated, and per-match LP changes are never
 * invented (they are not stored). Remakes and early surrenders get no tags:
 * their rows already explain why the game is unrated. At most three tags,
 * most significant first.
 */
export function matchTags(match: MatchSummary): MatchTag[] {
  if (isEarlySurrender(match)) return [];
  const tags: MatchTag[] = [];
  const duration = Number.isFinite(match.durationSec) && match.durationSec > 0 ? match.durationSec : 0;
  const minutes = duration / 60;
  const ratio = kda(match);

  // A 9+ rating already announced by the MVP badge would be a duplicate.
  if (typeof match.performanceRating === "number" && match.performanceRating >= 9 &&
    match.ratingBadge !== "MVP" && match.ratingBadge !== "Shared MVP") {
    tags.push({ id: "hand-of-baron", label: "Hand of Baron",
      reason: `Baron Match Rating ${match.performanceRating.toFixed(1)} out of 10 in this game.` });
  }
  if (typeof match.killParticipation === "number" && match.killParticipation >= 0.7 && match.killParticipation <= 1) {
    const kills = typeof match.teamKills === "number" && match.teamKills > 0 ? ` of your team's ${match.teamKills} kills` : "";
    tags.push({ id: "in-every-fight", label: "In Every Fight",
      reason: `Involved in ${Math.round(match.killParticipation * 100)}%${kills}.` });
  }
  if (typeof match.vision === "number" && duration >= 600 && match.vision >= 40 && match.vision / minutes >= 1.5) {
    tags.push({ id: "servant-of-darkness", label: "Servant of Darkness",
      reason: `${match.vision} vision score · ${(match.vision / minutes).toFixed(1)} per minute.` });
  }
  if (duration >= 900 && match.deaths <= 1) {
    tags.push({ id: "untouchable", label: "Untouchable",
      reason: match.deaths === 0 ? `Zero deaths in ${durationText(duration)}.` : `One death in ${durationText(duration)}.` });
  }
  if (match.damageVersion === 1 && typeof match.teamDamageShare === "number" &&
    match.teamDamageShare >= 0.3 && match.teamDamageShare <= 1) {
    tags.push({ id: "heavy-hitter", label: "Heavy Hitter",
      reason: `${Math.round(match.teamDamageShare * 100)}% of your team's damage.` });
  }
  if (match.win && duration > 0 && duration < 22 * 60) {
    tags.push({ id: "stomp", label: "Stomp", reason: `Won in ${durationText(duration)}.` });
  }
  if (typeof match.teamBaronKills === "number" && match.teamBaronKills >= 2) {
    tags.push({ id: "baron-regular", label: "Baron Regular",
      reason: `Your team secured ${match.teamBaronKills} Barons.` });
  }
  if (match.deaths >= 5 && ratio !== null && ratio < 1) {
    tags.push({ id: "rough-one-out", label: "Rough One Out",
      reason: `${match.kills}/${match.deaths}/${match.assists} · ${ratio.toFixed(2)} KDA.` });
  }
  if (FARMING_ROLES.has(match.role) && duration >= 1200 && Number.isFinite(match.cs) && match.cs / minutes < 5) {
    tags.push({ id: "slow-harvest", label: "Slow Harvest",
      reason: `${(match.cs / minutes).toFixed(1)} CS per minute on a farming role.` });
  }
  return tags.slice(0, MAX_TAGS);
}
