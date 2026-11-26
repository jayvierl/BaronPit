import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isBanned } from "@/lib/auth";
import { pilotDashboard } from "@/lib/pilot";
import { featuredResults } from "@/lib/featured-sample";
import { PilotReview } from "@/components/pilot-review";

export const dynamic = "force-dynamic";
const fraction = (n: number, total: number) =>
  total ? `${n}/${total} (${Math.round((100 * n) / total)}%)` : "No eligible observations yet";
const channels: Record<string, string> = {
  all: "First 40 players",
  club: "Club or coach",
  community: "Player community",
};
function mondayUtc() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export default async function AdminPilotPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=%2Fadmin%2Fpilot");
  if (!isAdmin(user.email) || isBanned(user)) notFound();
  const [data, feature] = await Promise.all([pilotDashboard().catch(() => null), featuredResults().catch(() => null)]);
  if (!data)
    return (
      <div>
        <h1>Pilot results unavailable</h1>
        <p role="alert">The measurements could not load. Retry before making a decision.</p>
      </div>
    );
  const all = data.scores[0];
  return (
    <div>
      <h1 className="page-title">Pilot results</h1>
      <p>
        {data.enrolled} opted-in players · {data.hosts} enrolled hosts. The decision cohort uses the earliest
        40 active consents, ordered by enrollment. A withdrawal removes that player from the calculations.
      </p>
      {!all.people && (
        <p className="notice">
          No players have enrolled. Start with a club or coach invitation and an independent player community.
          Results will appear as members participate.
        </p>
      )}
      <section className="card">
        <h2>Four-week decision</h2>
        <p>
          Recruit 40 players through both channels. Look for 20 genuine questions from at least 10 different
          players, with 60% receiving a player-marked useful non-host reply within 24 hours. Look for at least
          10 of the first 40 to read an answer or contribute in week four.
        </p>
        <p>
          {all.people}/40 players · {data.scores.slice(1).filter((r) => r.people > 0).length}/2 channels ·{" "}
          {all.askers}/10 askers · {all.questions}/20 questions.
        </p>
        <p>
          Useful non-host replies within 24 hours: {fraction(all.timely, all.judged)}. Mature week-four
          returns: {fraction(all.returns, all.mature)}.
        </p>
        <p className="meta">
          Timeliness uses the reply timestamp, confirmed when the asker marks it helpful. The denominator
          includes visible decision questions with a full 24-hour opportunity. Review duplicates and test
          submissions before counting genuine questions. An answer view requires the end of a helpful reply to
          be visible for one second. Each player’s week four spans days 22–28 after enrollment. Wait until all
          40 complete that window before deciding.
        </p>
      </section>
      {data.scores.map((s) => (
        <section className="card" key={s.cohort}>
          <h2>{channels[s.cohort]}</h2>
          <p>
            {s.people} enrolled · {s.askers} askers · {s.questions} visible decision questions.
          </p>
          <p>Questions with a timely, useful non-host reply: {fraction(s.timely, s.judged)}.</p>
          <p>
            Accepted replies across the pilot: {s.peer} from fellow enrolled players, {s.outsider} from other
            independent players, {s.hosted} from hosts or staff.
          </p>
          <p>
            {s.firstExchange} players marked a first useful non-host answer. First-week activation:{" "}
            {fraction(s.weekOneExchange, s.weekOneReady)}.{" "}
            {s.medianHours !== null
              ? `Median time from joining to first useful exchange: ${s.medianHours} hours.`
              : "Time to first exchange is pending."}
          </p>
          <p>
            Week-four return: {fraction(s.returns, s.mature)}. {s.readers} read an answer without
            contributing, {s.writers} contributed, {s.otherReads} browsed social pages without reading an
            answer or contributing, and {s.statsOnly} checked stats only.
          </p>
        </section>
      ))}
      <section className="card">
        <h2>Coach and club interest</h2>
        {data.interest.length === 0 ? (
          <p>No research responses yet.</p>
        ) : (
          <ul>
            {data.interest.map((i) => (
              <li key={i.audience + i.intent + i.budget}>
                {i.n} {i.audience} ·{" "}
                {i.intent === "trial" ? "would host a free four-week trial" : "open to an interview"} ·
                monthly group budget{" "}
                {i.budget === "unknown" ? "undisclosed" : i.budget === "free" ? "free only" : "$" + i.budget}
              </li>
            ))}
          </ul>
        )}
        <p className="meta">
          These are stated research preferences. No subscriptions or payments are collected.
        </p>
      </section>
      <section className="card">
        <h2>After opening the featured matchup</h2>
        {!feature ? <p role="status">The sample is unavailable.</p> : !feature.opened ? <p>No opted-in readers yet.</p> : <>
          <p>{feature.opened} pilot readers started the sample. {feature.other} opened another visible discussion and {feature.asked} posted a new visible question within 30 minutes.</p>
          <p className="meta">One separately volunteered sample per non-host player. Counts can overlap. These are observed next actions in an uninterrupted tab. They do not establish why players took them.</p>
        </>}
      </section>
      <h2>Staffing and quality</h2>
      {!data.reviews.length && (
        <p>
          No weekly reviews recorded. Record actual minutes, spend, interviews and safety coverage before
          interpreting adoption.
        </p>
      )}
      {data.reviews.map((r) => (
        <article key={r.weekStart} className="card">
          <h3>Week of {r.weekStart}</h3>
          <p>
            {r.hostMinutes} host minutes · {r.safetyMinutes} safety minutes · USD{" "}
            {(r.costCents / 100).toFixed(2)} provider spend.
          </p>
          <p>
            {r.interviews}/5 interviews · actionable sampled replies: {fraction(r.useful, r.sampled)} ·
            two-person drill: {r.drill}.
          </p>
        </article>
      ))}
      <PilotReview reviews={data.reviews} monday={mondayUtc()} />
      <Link href="/pilot">View enrollment</Link>
    </div>
  );
}
