import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { dbAvailable } from "@/lib/db";
import { reviewHosts } from "@/lib/community-review";
import { isPilotHost } from "@/lib/pilot";
import { signInHref } from "@/lib/signin-return";
import { reviewHour, reviewHostStatus, reviewRoleLabel, reviewRoles } from "@/lib/review-hour-time";
import { LocalReviewTime, HostAction } from "@/components/review-hour-controls";
import styles from "@/components/community-review.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bot lane review hour" };

export default async function ReviewHourPage() {
  const viewer = await getCurrentUser();
  const session = reviewHour();
  const hosts = dbAvailable() ? await reviewHosts(session.start, viewer?.id ?? null).catch(() => null) : null;
  const own = hosts?.find((h) => h.id === viewer?.id);
  return (
    <div>
      <h1 className="page-title">Bot lane review hour</h1>
      <p>
        Bring one decision from a recent game or answer a bot laner’s question together. The discussion stays
        open all week.
      </p>
      <section className={styles.panel}>
        <h2>{session.live ? "Scheduled hour underway" : "Next community hour"}</h2>
        <p>
          <strong>
            <LocalReviewTime start={session.start} end={session.end} />
          </strong>
        </p>
        <p className="meta">Every Saturday at 21:00 UTC for one hour. Open to support and bot carry players.</p>
        {hosts && <p>{reviewHostStatus(hosts)}</p>}
        <div className={styles.links}>
          <a className="btn small" href={`/review-hour/calendar?day=${session.start.slice(0, 10)}`}>
            Add this hour to calendar
          </a>
          <Link href="/questions/new">Bring a question</Link>
        </div>
      </section>
      <section className={styles.panel}>
        <h2>Questions for the session</h2>
        <p>Choose a role to find decisions still awaiting a helpful answer.</p>
        <div className={styles.links}>
          {reviewRoles.map((role) => (
            <Link className="btn small" key={role} href={`/questions?mode=unanswered&role=${role}`}>
              {reviewRoleLabel(role)} questions
            </Link>
          ))}
        </div>
      </section>
      <section className={styles.panel}>
        <h2>Session hosts</h2>
        {hosts === null ? (
          <p role="status">The host list is temporarily unavailable.</p>
        ) : (
          <>
            <ul className={styles.slots}>
              {reviewRoles.map((role) => {
                const host = hosts.find((h) => h.role === role);
                return (
                  <li key={role}>
                    <span>
                      <strong>{reviewRoleLabel(role)}</strong> ·{" "}
                      {host ? <Link href={`/u/${host.id}`}>{host.name}</Link> : "No confirmed host to show"}
                    </span>
                    {viewer && isPilotHost(viewer) && (host?.id === viewer.id || (!host && !own)) && (
                      <HostAction role={role} start={session.start} own={host?.id === viewer.id} />
                    )}
                  </li>
                );
              })}
            </ul>
            {viewer && isPilotHost(viewer) && (
              <p className="meta">Confirm one slot to list your public profile as a host for this session.</p>
            )}
            {!viewer && <Link href={signInHref("/review-hour")}>Session hosts can sign in here</Link>}
          </>
        )}
      </section>
    </div>
  );
}
