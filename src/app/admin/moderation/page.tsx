import { signInHref } from "@/lib/signin-return";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isAdmin, isBanned } from "@/lib/auth";
import { activeRoomProtections } from "@/lib/room-safety";
import { RoomProtectionForm, ReviewForm } from "@/components/admin-ui";
import { reviewQueue, safeString } from "@/lib/safety-cases";
import { isKind, isRule, reportRules } from "@/lib/safety-policy";
import { clipLink } from "@/lib/clip-link";

export const dynamic = "force-dynamic";
export default async function ModerationPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInHref("/admin/moderation"));
  if (!isAdmin(user.email) || isBanned(user)) notFound();
  const [queue, protectedRooms] = await Promise.all([
    reviewQueue(user).catch(() => null),
    activeRoomProtections().catch(() => null),
  ]);
  return (
    <main>
      <h1 className="page-title">Moderation queue</h1>
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
          {!queue.cases.length && !queue.appeals.length && (
            <p className="card">No cases are awaiting your review.</p>
          )}
          {queue.cases.map((r) => {
            const kind = r.kind,
              rule = isRule(r.rule) ? r.rule : "other";
            if (!isKind(kind)) return null;
            const link = r.receipt ? null : clipLink(r.link);
            return (
              <article className="card" key={kind + ":" + r.id}>
                <h2>{reportRules[rule]}</h2>
                <p className="meta">
                  P{String(r.priority)} · {kind} #{String(r.id)} · {String(r.reports)} independent reports
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
          {queue.appeals.length > 0 && <h2>Independent appeals</h2>}
          {queue.appeals.map((r) => (
            <article className="card" key={Number(r.id)}>
              <h3>Appeal #{String(r.id)}</h3>
              <p>
                {safeString(r, "message") || "Review this appeal through the restricted responder process."}
              </p>
              <ReviewForm kind="appeal" id={Number(r.id)} rule={isRule(r.rule) ? r.rule : "other"} />
            </article>
          ))}
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
    </main>
  );
}
