import Link from "next/link";
import { SafetyReport } from "@/components/safety-report";
import { getCurrentUser } from "@/lib/auth";
import { dbAvailable } from "@/lib/db";
import { DecisionPreference } from "@/components/decision-preference";
import { signInHref } from "@/lib/signin-return";
import { decisions, questionPreference, type DecisionFilter } from "@/lib/decisions";
import { decisionRoles, decisionTopics, knownDecisionTopic, trialOutcomes } from "@/lib/decisions-input";
import { validId } from "@/lib/ids";
import { championList } from "@/lib/riot";
import styles from "./questions.module.css";

export const dynamic = "force-dynamic";
type Query = Record<string, string | string[] | undefined>;
function value(input: Query, key: string) {
  return typeof input[key] === "string" ? input[key].slice(0, 120) : "";
}
export default async function Questions({ searchParams }: { searchParams: Promise<Query> }) {
  const [params, viewer, catalog] = await Promise.all([searchParams, getCurrentUser(), championList()]);
  const saved = viewer && dbAvailable() ? await questionPreference(viewer.id) : null;
  const requested = value(params, "mode");
  const topic = knownDecisionTopic(value(params, "topic"));
  const publicFilters = topic || ["q", "champion", "opponent", "role", "patch"].some((key) => value(params, key));
  const mode =
    requested === "answered"
      ? "answered"
      : requested === "mine" || (!requested && !publicFilters && saved)
        ? "mine"
        : "unanswered";
  const filters: DecisionFilter = { mode };
  const query = new URLSearchParams();
  if (topic && mode !== "mine") {
    filters.topic = topic;
    query.set("topic", topic);
  }
  for (const key of ["champion", "opponent", "role", "patch", "q"] as const) {
    const v = value(params, key);
    if (v && mode !== "mine") {
      filters[key] = v;
      query.set(key, v);
    }
  }
  const before = Number(value(params, "before"));
  if (validId(before)) filters.before = before;
  const rows =
    mode === "mine" && !saved
      ? []
      : dbAvailable()
        ? await decisions(viewer?.id ?? null, filters).catch(() => null)
        : null;
  function href(m: string, cursor?: number, selectedTopic?: string) {
    const url = new URLSearchParams(query);
    url.set("mode", m);
    if (selectedTopic) url.set("topic", selectedTopic);
    if (cursor) url.set("before", String(cursor));
    return "/questions?" + url.toString();
  }
  return (
    <section>
      <header className={styles.header}>
        <h1>Matchup notebook</h1>
        <Link href="/questions/new" className="btn gold">
          Ask a question
        </Link>
      </header>
      <nav className={styles.tabs} aria-label="Question lists">
        <Link href={href("unanswered")} aria-current={mode === "unanswered" ? "page" : undefined}>
          Awaiting a helpful answer
        </Link>
        <Link href={href("answered")} aria-current={mode === "answered" ? "page" : undefined}>
          Answered matchups
        </Link>
        <Link href="/questions?mode=mine" aria-current={mode === "mine" ? "page" : undefined}>
          My unanswered questions
        </Link>
      </nav>
      {mode === "mine" &&
        (viewer ? (
          <DecisionPreference saved={saved} champions={catalog.map(({ id, name }) => ({ id, name }))} />
        ) : (
          <p>
            <Link className="btn small" href={signInHref("/questions?mode=mine")}>
              Sign in to save your queue
            </Link>
          </p>
        ))}
      {mode !== "mine" && (
        <form className={styles.form} action="/questions" method="get">
          <input type="hidden" name="mode" value={mode} />
          <div className={styles.filters}>
            {(["champion", "opponent"] as const).map((key) => (
              <label key={key}>
                {key === "champion" ? "Champion" : "Opponent"}
                <select name={key} defaultValue={filters[key] ?? ""}>
                  <option value="">Any champion</option>
                  {catalog.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Role
              <select name="role" defaultValue={filters.role ?? ""}>
                <option value="">All roles</option>
                {decisionRoles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Topic
              <select name="topic" defaultValue={filters.topic ?? ""}>
                <option value="">All topics</option>
                {decisionTopics.map((topic) => <option key={topic}>{topic}</option>)}
              </select>
            </label>
            <label>
              Patch at posting
              <input name="patch" defaultValue={filters.patch} placeholder="e.g. 26.23" maxLength={12} />
            </label>
          </div>
          <label>
            Question or answer contains
            <input type="search" name="q" defaultValue={filters.q} maxLength={120} />
          </label>
          <div className={styles.controls}>
            <button type="submit" className="btn small">
              Apply filters
            </button>
            {query.size > 0 && <Link href={"/questions?mode=" + mode}>Clear filters</Link>}
          </div>
        </form>
      )}
      {mode === "mine" && !saved ? null : rows === null ? (
        <p role="status">Community questions are temporarily unavailable.</p>
      ) : rows.length === 0 ? (
        <p>
          {mode === "answered"
            ? "No answered matchups here yet. A question joins this notebook when its author chooses a helpful reply."
            : "No questions awaiting a helpful answer here."}{" "}
          <Link href="/questions/new">Ask about a decision.</Link>
        </p>
      ) : (
        rows.slice(0, 20).map((d) => (
          <article key={d.postId} className={styles.entry}>
            <div className="meta">
              {d.champion}
              {d.opponent && " vs " + d.opponent} · {d.role} · {knownDecisionTopic(d.topic)
                ? <Link href={href(d.answer ? "answered" : "unanswered", undefined, d.topic)}>{d.topic}</Link> : d.topic}
              {d.patch && " · Patch " + d.patch}
              {d.itemName && " · " + d.itemName}
            </div>
            <h2>
              <Link href={"/post/" + d.postId}>{d.body}</Link>
            </h2>
            <Link className="meta" href={"/u/" + d.authorId}>
              {d.authorName}
            </Link>{" "}
            <SafetyReport kind="post" targetId={d.postId} />
            {d.answer && (
              <blockquote className={styles.answer}>
                {d.answer.body}
                <footer className="meta">
                  Helpful answer from <Link href={"/u/" + d.answer.authorId}>{d.answer.name}</Link>{" "}
                  <SafetyReport kind="comment" targetId={d.answer.id} />
                </footer>
              </blockquote>
            )}
            {d.outcome && <p className="meta">Author’s follow-up · {trialOutcomes[d.outcome]}</p>}
          </article>
        ))
      )}
      {rows && rows.length > 20 && (
        <Link href={href(mode, rows[19].postId)} className="btn secondary">
          Older questions
        </Link>
      )}
    </section>
  );
}
