import { DuoEvening } from "@/components/duo-evening";
import Link from "next/link";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { isPilotHost, pilotState } from "@/lib/pilot";
import { signInHref } from "@/lib/signin-return";
import { duoEnabled } from "@/lib/duo";
import { duoPilotState } from "@/lib/duo-pilot";
import { PilotForms } from "@/components/pilot-forms";

export const dynamic = "force-dynamic";
export default async function PilotPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const channel = params.from === "club" ? "club" : "community";
  const [data, duoStart] = user ? await Promise.all([pilotState(user.id).catch(() => null),duoPilotState(user.id).catch(() => undefined)]) : [null, null];
  return (
    <div>
      <h1 className="page-title">Bot lane review pilot</h1>
      <p>
        Bring one decision from your latest game. Ask a support or bot carry what they would try, mark the
        reply that helped, and tell the room how your next game went.
      </p>
      <DuoEvening user={user}/>
      <section className="card">
        <h2>Four weeks with NA players</h2>
        <p>
          We’re testing whether Silver to Platinum players get a useful answer within a day and come back for
          another conversation. Participation is optional.
        </p>
        <p>
          For 28 days, we record whether you viewed social pages, viewed a selected answer, or checked a
          player’s stats that day. We count visible posts, replies and follow-ups you make during that window.
          Pilot records contain your account reference, role and recruitment channel. They omit viewed page
          addresses and match details.
        </p>
        <p>
          Staff see totals in the pilot dashboard. You can withdraw here. Account-linked pilot records expire
          after eight weeks. Your public posts remain subject to the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>
      <p><Link href="/pilot/phone-test">Taking the five-player phone test? Open the participant guide.</Link></p>
      {!user ? (
        <Link className="btn gold" href={signInHref("/pilot?from=" + channel)}>
          Sign in to participate
        </Link>
      ) : !data ? (
        <p className="notice warn" role="alert">
          Your pilot settings couldn’t load. Please try again shortly.
        </p>
      ) : (
        <PilotForms
          host={isPilotHost(user)}
          duoStarted={duoStart}
          duoOpen={duoEnabled()}
          channel={channel}
          joinedAt={data.member?.joinedAt ?? null}
          interest={data.interest}
          current={user.termsCurrent && !isBanned(user)}
        />
      )}
    </div>
  );
}
