import { signInHref } from "@/lib/signin-return";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isAdmin, isBanned } from "@/lib/auth";
import { activeRoomProtections } from "@/lib/room-safety";
import { RoomProtectionForm, ReviewForm } from "@/components/admin-ui";
import { reviewAgeHours, reviewQueue, safeString } from "@/lib/safety-cases";
import { isKind, isRule, reportRules } from "@/lib/safety-policy";
import { clipLink } from "@/lib/clip-link";

export const dynamic = "force-dynamic";
type QueueSearch = { cases?: string; appeals?: string };

function queueHref(cases?: string | null, appeals?: string | null, section?: string) {
  const params = new URLSearchParams();
  if (cases) params.set("cases", cases);
  if (appeals) params.set("appeals", appeals);
  return "/admin/moderation" + (params.size ? "?" + params : "") + (section ? "#" + section : "");
}

function waitingSince(opened: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(opened)) / 60_000));
  let age = "under a minute";
  if (minutes >= 1440) age = Math.floor(minutes / 1440) + " d " + Math.floor((minutes % 1440) / 60) + " hr";
  else if (minutes >= 60) age = Math.floor(minutes / 60) + " hr " + (minutes % 60) + " min";
  else if (minutes > 0) age = minutes + " min";
  return <time dateTime={opened} title={new Date(opened).toUTCString()}>{age}</time>;
}

export default async function ModerationPage({ searchParams }: { searchParams: Promise<QueueSearch> }) {
  const params = await searchParams;
  const cases = typeof params.cases === "string" && params.cases.length <= 65 ? params.cases : undefined;
  const appeals = typeof params.appeals === "string" && params.appeals.length <= 65 ? params.appeals : undefined;
  const user = await getCurrentUser();
  if (!user) redirect(signInHref(queueHref(cases, appeals)));
  if (!isAdmin(user.email) || isBanned(user)) notFound();
  const [queue, protectedRooms] = await Promise.all([
    reviewQueue(user, { cases, appeals }).catch(() => null),
    activeRoomProtections().catch(() => null),
  ]);
  return (
    <section aria-labelledby="moderation-title">
      <h1 id="moderation-title" className="page-title">Moderation queue</h1>
      <p><Link href="/admin/moderation/photos">Review profile photos →</Link></p>
      <p className="meta">
        Urgent cases appear first. Report counts describe how many different people raised a concern. Check
        the context before deciding.
      </p>
      {!queue ? (
        <p className="notice warn" role="alert">
          The queue could not be loaded. Refresh or contact the on-call responder.
        </p>
      ) : (
        <>
          {queue.summary.length > 0 && <section aria-labelledby="waiting-title" className="card">
            <h2 id="waiting-title">Waiting for your review</h2>
            {queue.summary.map((group) => (
              <p key={group.priority}>
                <strong>{group.priority === 3 ? <a href="#appeals">Independent appeals</a> : "P" + group.priority + " cases"}</strong>
                {" · "}{group.total} waiting · oldest {waitingSince(group.oldest, queue.checkedAtMs)}
                {" · "}{group.pastMarker} waiting ≥ {reviewAgeHours[group.priority]} hr
              </p>
            ))}
            <p className="meta">Elapsed time includes hours outside staffed coverage.</p>
          </section>}
          {!queue.summary.length && (
            <p className="card">No cases are awaiting your review.</p>
          )}
          <div id="cases">
            {cases && <Link href={queueHref(null, appeals, "cases")}>Back to highest-priority cases</Link>}
            {cases && !queue.cases.length && <p>No further cases on this page.</p>}
          </div>
          {queue.cases.map((r) => {
            const kind = r.kind,
              rule = isRule(r.rule) ? r.rule : "other";
            if (!isKind(kind)) return null;
            const link = r.receipt ? null : clipLink(r.link);
            return (
              <article className="card" key={kind + ":" + r.id}>
                <h2>{r.reports === 0 && !r.receipt ? "Held submission" : reportRules[rule]}</h2>
                <p className="meta">
                  P{String(r.priority)} · {kind} #{String(r.id)} · {String(r.reports)} independent reports
                  {" · "}Waiting {waitingSince(r.opened_at, queue.checkedAtMs)}
                </p>
                {r.receipt ? (
                  <p>
                    Restricted incident {String(r.receipt)}. Verify the receipt in the private responder
                    process before recording a decision.{" "}
                    {r.release_requested_by != null &&
                      "A release recommendation is awaiting a second responder."}
                  </p>
                ) : (
                  <>
                    <details>
                      <summary>Review evidence</summary>
                      <p>{safeString(r, "excerpt") || "Structured submission"}</p>
                      {Boolean(r.note) && <p>Reporter context — {safeString(r, "note")}</p>}
                      {link && (
                        <a href={link.href} target="_blank" rel="noreferrer">
                          Inspect external clip at {link.hostname}
                        </a>
                      )}
                    </details>
                    {!r.releasable && <p>This media has no eligible publication path.</p>}
                  </>
                )}
                <ReviewForm id={Number(r.id)} kind={kind} rule={rule} releasable={Boolean(r.releasable)} />
              </article>
            );
          })}
          {queue.nextCases && <Link href={queueHref(queue.nextCases, appeals, "cases")}>Next cases</Link>}
          <div id="appeals">
            {(queue.appeals.length > 0 || appeals) && <h2>Independent appeals</h2>}
            {appeals && <Link href={queueHref(cases, null, "appeals")}>Back to oldest appeals</Link>}
            {appeals && !queue.appeals.length && <p>No further appeals on this page.</p>}
          </div>
          {queue.appeals.map((r) => (
            <article className="card" key={Number(r.id)}>
              <h3>Appeal #{String(r.id)}</h3>
              <p className="meta">Waiting {waitingSince(r.opened_at, queue.checkedAtMs)}</p>
              <p>
                {safeString(r, "message") || "Review this appeal through the restricted responder process."}
              </p>
              <ReviewForm kind="appeal" id={Number(r.id)} rule={isRule(r.rule) ? r.rule : "other"} />
            </article>
          ))}
          {queue.nextAppeals && <Link href={queueHref(cases, queue.nextAppeals, "appeals")}>Next appeals</Link>}
        </>
      )}
      <section className="card">
        <h2>Room incident controls</h2>
        <p>
          During an incident, players can contribute once every 15 seconds per room. Links and clip posts
          pause for 15 minutes. Reports and appeals stay open.
        </p>
        {protectedRooms === null ? (
          <p role="alert">Active protections could not be read.</p>
        ) : (
          protectedRooms.map((r) => (
            <p key={String(r.slug)}>
              <strong>{String(r.name)}</strong> · {String(r.slug)} · until{" "}
              {new Date(String(r.raid_until)).toLocaleTimeString()}
            </p>
          ))
        )}
        <RoomProtectionForm />
      </section>
      <Link href="/guidelines">Community guidelines</Link>
    </section>
  );
}
