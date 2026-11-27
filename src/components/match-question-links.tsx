import Link from "next/link";
import type { CardItem } from "@/lib/build-catalog";
import { questionHref, questionStarters, type QuestionMatch } from "@/lib/decisions-input";
import styles from "@/app/questions/questions.module.css";

export function MatchQuestionLinks({
  match,
  items = [],
  showStarters = false,
  showQuestion = true,
  fromMatch,
}: {
  match: QuestionMatch;
  items?: CardItem[];
  showStarters?: boolean;
  showQuestion?: boolean;
  fromMatch?: string;
}) {
  const named = Array.from(new Map(items.map((i) => [i.id, i])).values());
  return (
    <>
      {showStarters && (
        <section className={styles.starters} aria-label="Start a question about the latest match">
          <strong>Ask the community about this game</strong>
          <div>
            {questionStarters.map((starter) => (
              <Link key={starter.id} href={questionHref(match, starter.id, { fromMatch })} prefetch={false}>
                {starter.label}
              </Link>
            ))}
          </div>
        </section>
      )}
      {(showQuestion || named.length > 0) && <div className={styles.controls}>
        {showQuestion && <Link className="text-btn" href={questionHref(match, undefined, { fromMatch })} prefetch={false}>
          {showStarters ? "Write my own question" : "Ask about this game"}
        </Link>}
        {named.length > 0 && (
          <details>
            <summary>Ask about an item</summary>
            <ul>
              {named.map((item) => (
                <li key={item.id}>
                  <Link href={questionHref({ ...match, itemId: item.id }, undefined, { fromMatch })} prefetch={false}>{item.name}</Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>}
    </>
  );
}
