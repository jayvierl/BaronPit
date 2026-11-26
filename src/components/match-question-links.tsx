import Link from "next/link";
import type { CardItem } from "@/lib/build-catalog";
import { questionHref, questionStarters } from "@/lib/decisions-input";
import styles from "@/app/questions/questions.module.css";

export function MatchQuestionLinks({
  puuid,
  matchId,
  items = [],
  showStarters = false,
}: {
  puuid: string;
  matchId: string;
  items?: CardItem[];
  showStarters?: boolean;
}) {
  const named = Array.from(new Map(items.map((i) => [i.id, i])).values());
  return (
    <>
      {showStarters && (
        <section className={styles.starters} aria-label="Start a question about the latest match">
          <strong>Ask the community about this game</strong>
          <div>
            {questionStarters.map((starter) => (
              <Link key={starter.id} href={questionHref({ puuid, matchId }, starter.id)}>
                {starter.label}
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className={styles.controls}>
        <Link className="text-btn" href={questionHref({ puuid, matchId })}>
          {showStarters ? "Write my own question" : "Ask about this game"}
        </Link>
        {named.length > 0 && (
          <details>
            <summary>Ask about an item</summary>
            <ul>
              {named.map((item) => (
                <li key={item.id}>
                  <Link href={questionHref({ puuid, matchId, itemId: item.id })}>{item.name}</Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}
