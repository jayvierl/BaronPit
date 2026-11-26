import Link from "next/link";
import { isBanned, type User } from "@/lib/auth";
import { duoEnabled } from "@/lib/duo";
import { arrivalConsent, eveningChoice, eveningTotals, proposedEvening } from "@/lib/duo-evening";
import { duoPilotState } from "@/lib/duo-pilot";
import { signInHref } from "@/lib/signin-return";
import { DuoEveningForm } from "./duo-evening-form";
import { LocalReviewTime } from "./review-hour-controls";

export async function DuoEvening({ user }: {user: User | null}) {
  const start = proposedEvening();
  const data = user ? await Promise.all([eveningChoice(user.id,start),duoPilotState(user.id),arrivalConsent(user.id)]).catch(()=>null) : null;
  return <section id="duo-evening" className="card">
    <h2>NA bot-lane duo evening</h2>
    <p>Would you play an hour of Normal Draft with another adult player? Your answer helps us choose whether to staff this proposed session. Staff see role totals. Availability expires when the hour begins. You can remove it here.</p>
    <p className="meta">Proposed time. Host confirmation and verified matching are still required before invitations.</p>
    {user && data ? <>
       <DuoEveningForm start={start} saved={data[0]} canVolunteer={user.ageBand==="adult" && user.termsCurrent && !isBanned(user)}
         study={Boolean(data[1]) && duoEnabled()} sampling={data[2]}/>
       {!user.termsCurrent && <Link href={signInHref("/pilot#duo-evening","enrol")}>Review community eligibility</Link>}
    </> : user ? <p role="status">Your choice couldn’t load. Refresh to try again.</p> : <>
       <p><LocalReviewTime start={start} end={new Date(Date.parse(start)+3600000).toISOString()}/></p>
       <Link href={signInHref("/pilot#duo-evening")}>Sign in to share availability</Link>
    </>}
  </section>;
}

export async function DuoEveningTotals() {
  const start=proposedEvening();
  const results=await eveningTotals(start).catch(()=>null);
  return <section className="card">
    <h2>NA duo evening availability</h2>
    {results ? <>
      <p><LocalReviewTime start={start} end={new Date(Date.parse(start)+3600000).toISOString()}/></p>
      <p>{results.bot} bot carry · {results.support} support. Each volunteer counts once. These are stated role preferences for an unconfirmed session.</p>
      <h3>Suggested board coverage</h3>
      <p>{results.days ? `${results.available} of ${results.days} sampled player-days had an available fit. ${results.days-results.available} had none.` : "No eligible visits have been sampled yet."}</p>
      <p className="meta">First foreground visit per UTC day across today and the previous six days, for eligible volunteers with a saved plan and separate consent. Reopening Suggested does not add another arrival.</p>
    </> : <p role="status">Availability and board coverage couldn’t load.</p>}
  </section>;
}
