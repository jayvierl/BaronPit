import Link from "next/link";
import { SafetyReport } from "@/components/safety-report";
import { decisions, trialOptions } from "@/lib/decisions";
import { knownDecisionTopic, trialOutcomes } from "@/lib/decisions-input";
import { listComments } from "@/lib/social";
import type { User } from "@/lib/auth";
import { DecisionAuthorControls } from "./decision-author-controls";
import { PilotVisit } from "@/components/pilot-visit";
import styles from "@/app/questions/questions.module.css";

export async function DecisionThread({ postId, user }: { postId: number; user: User | null }) {
  const [d] = await decisions(user?.id ?? null, { postId });
  if (!d) return null;
  const owner = !!user && d.authorId === user.id;
  const [comments, games] = owner
    ? await Promise.all([listComments(postId, user), d.answer ? trialOptions(user.id, postId) : []])
    : [[], []];
  const query = new URLSearchParams({
    mode: "answered",
    champion: d.champion,
    ...(d.opponent && { opponent: d.opponent }),
  });
  return (
    <section className="card" aria-label="Decision and follow-up">
      <h2>
        {d.champion}
        {d.opponent && " vs " + d.opponent}
      </h2>
      <p className="meta">
        {d.role} · {knownDecisionTopic(d.topic) ? (
          <Link href={"/questions?" + new URLSearchParams({ mode: d.answer ? "answered" : "unanswered", topic: d.topic })}>
            {d.topic}
          </Link>
        ) : d.topic}
        {d.patch && " · Patch " + d.patch}
        {d.itemId && (
          <span>
            {" "}
            · Item decision · <Link href={"/items/" + d.itemId}>{d.itemName}</Link>
          </span>
        )}
      </p>
      {d.answer ? (
        <>
          <h3>Author’s helpful answer</h3>
          <blockquote className={styles.answer}>
            {d.answer.body}
            <footer className="meta">
              <Link href={"/u/" + d.answer.authorId}>{d.answer.name}</Link>{" "}
              <SafetyReport kind="comment" targetId={d.answer.id} />
            </footer>
          </blockquote>
          {user?.pilotActive && user.id !== d.answer.authorId && <PilotVisit kind="answer" postId={postId} />}
        </>
      ) : (
        <p className="meta">Awaiting a helpful answer.</p>
      )}
      {d.outcome && (
        <p>
          <strong>Author’s follow-up</strong> · {trialOutcomes[d.outcome]}
          {d.trialMatch && (
            <span className="meta">
              {" "}
              · Riot-verified recent game · {d.trialMatch.champion} ·{" "}
              {d.trialMatch.win ? "Victory" : "Defeat"} · {d.trialMatch.kills}/{d.trialMatch.deaths}/
              {d.trialMatch.assists}
            </span>
          )}
        </p>
      )}
      {owner && (
        <DecisionAuthorControls
          postId={postId}
          acceptedId={d.answer?.id}
          attachedId={d.trialMatch?.matchId}
          outcome={d.outcome}
          choices={comments
            .filter((c) => c.authorId !== user.id)
            .map((c) => ({ id: c.id, name: c.authorName, body: c.body }))}
          games={
            d.trialMatch && !games.some((m) => m.matchId === d.trialMatch?.matchId)
              ? [d.trialMatch, ...games]
              : games
          }
        />
      )}
      <Link href={"/questions?" + query}>More answered {d.champion} matchups</Link>
    </section>
  );
}
