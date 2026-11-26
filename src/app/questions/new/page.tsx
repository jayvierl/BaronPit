import Link from "next/link";
import { DecisionComposer } from "@/components/decision-composer";
import { getCurrentUser } from "@/lib/auth";
import { dbAvailable } from "@/lib/db";
import { decisionMatchItem } from "@/lib/decisions";
import { validId } from "@/lib/ids";
import { findQuestionStarter, questionHref } from "@/lib/decisions-input";
import { championList, getCachedPlayer } from "@/lib/riot";
import { publicPatch } from "@/lib/patch-notes";

export const dynamic = "force-dynamic";
export default async function AskQuestion({
  searchParams,
}: {
  searchParams: Promise<{ puuid?: string | string[]; matchId?: string | string[]; item?: string | string[]; starter?: string | string[] }>;
}) {
  const [params, user, champions] = await Promise.all([searchParams, getCurrentUser(), championList()]);
  const selection =
    typeof params.puuid === "string" &&
    params.puuid.length <= 120 &&
    typeof params.matchId === "string" &&
    params.matchId.length <= 70
      ? { puuid: params.puuid, matchId: params.matchId }
      : undefined;
  const starter = selection && findQuestionStarter(params.starter);
  const selectedItem = typeof params.item === "string" ? Number(params.item) : null;
  const player = selection && dbAvailable() ? await getCachedPlayer(selection.puuid) : null;
  const m = player?.snapshot.matches.find((m) => m.matchId === selection?.matchId);
  const item = await decisionMatchItem(m?.items, selectedItem);
  const match =
    player && m
      ? {
          item,
          puuid: player.puuid,
          matchId: m.matchId,
          champion: m.champion,
          opponent: champions.find((c) => c.id === m.opponentChampion)?.id ?? "",
          patch: publicPatch(m.gamePatch),
          role: m.role,
          riotId: player.gameName + "#" + player.tagLine,
        }
      : null;
  const destination = questionHref(selection && { ...selection, ...(item && { itemId: item.id }) }, starter?.id);
  return (
    <section>
      <Link className="meta" href="/questions">
        Matchup notebook
      </Link>
      <h1>Ask about a decision</h1>
      {params.item !== undefined && (!validId(selectedItem) || !item) ? (
        <p>
          This item is no longer in the selected recent game.{" "}
          <Link href={questionHref(selection, starter?.id)}>Ask without the item</Link>.
        </p>
      ) : selection && !match ? (
        <p>
          This game is outside the available recent form.{" "}
          <Link href="/questions/new">Ask without a game card</Link>.
        </p>
      ) : !dbAvailable() ? (
        <p role="status">Community questions are temporarily unavailable.</p>
      ) : (
        <DecisionComposer key={destination} destination={destination} signedIn={!!user}
          champions={champions.map(({ id, name }) => ({ id, name }))} match={match} starter={starter} />
      )}
    </section>
  );
}
