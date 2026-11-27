import Link from "next/link";
import { DecisionComposer } from "@/components/decision-composer";
import { getCurrentUser } from "@/lib/auth";
import { dbAvailable } from "@/lib/db";
import { decisionMatchItem } from "@/lib/decisions";
import { validId } from "@/lib/ids";
import { findQuestionStarter, questionHref, returnToMatch } from "@/lib/decisions-input";
import { parseMatchSelection, projectMatchContext } from "@/lib/match-context";
import { readQuestionMatch } from "@/lib/question-match";
import { championList } from "@/lib/riot";
import { DraftHelp } from "@/app/signin/draft-help";

export const dynamic = "force-dynamic";
export default async function AskQuestion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, user, champions] = await Promise.all([searchParams, getCurrentUser(), championList()]);
  const recovery = typeof params.draft === "string" && /^[0-9a-f-]{36}$/.test(params.draft) ? <DraftHelp/> : null;
  const requested = params.matchId !== undefined || params.puuid !== undefined || params.platform !== undefined || params.riotId !== undefined;
  const discuss = params.discuss === "1";
  const selection = parseMatchSelection(params);
  const attached = selection && dbAvailable() ? await readQuestionMatch(selection, user?.id ?? null).catch(() => null) : null;
  const starter = attached && !discuss ? findQuestionStarter(params.starter) : undefined;
  const selectedItem = typeof params.item === "string" ? Number(params.item) : null;
  const item = await decisionMatchItem(attached?.items, selectedItem);
  const preview = projectMatchContext(attached);
  const match = preview ? { ...preview, item } : null;
  const source = match ? returnToMatch(params.fromMatch, match) : undefined;
  const destination = questionHref(match ? { platform: match.platform, riotId: match.riotId, matchId: match.matchId,
    ...(item && { itemId: item.id }),
  } : undefined, starter?.id, { discuss, fromMatch: source });
  return (
    <section>
      <Link className="meta" href="/questions">
        Matchup notebook
      </Link>
      <h1>{discuss ? "Discuss this match" : "Ask about a decision"}</h1>
      {!dbAvailable() ? (
        <><p role="status">Community questions are temporarily unavailable.</p>{recovery}</>
      ) : (requested || discuss) && !match ? (
        <><p>This public match is unavailable. <Link href="/questions/new">Ask without a game card</Link>.</p>{recovery}</>
      ) : params.item !== undefined && (!validId(selectedItem) || !item) ? (
        <><p>
          This item is no longer in the selected recent game.{" "}
          <Link href={questionHref(match ?? undefined, starter?.id, { discuss, fromMatch: source })}>Ask without the item</Link>.
        </p>{recovery}</>
      ) : (
        <DecisionComposer key={destination} destination={destination} signedIn={!!user}
          champions={champions.map(({ id, name }) => ({ id, name }))} match={match} starter={starter}
          discuss={discuss} fromMatch={source}/>
      )}
    </section>
  );
}
