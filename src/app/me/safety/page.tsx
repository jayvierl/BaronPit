import { signInHref } from "@/lib/signin-return";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ownDecisions } from "@/lib/safety-cases";
import { myReports } from "@/lib/social";
import { AppealForm } from "@/components/admin-ui";
import { decisions, isDecision, isRule, reportRules } from "@/lib/safety-policy";
export const dynamic = "force-dynamic";
export default async function SafetyInbox() {
  const user = await getCurrentUser();
  if (!user) redirect(signInHref("/me/safety"));
  const inbox = await Promise.all([ownDecisions(user.id), myReports(user.id)]).catch(() => null);
  return (
    <main>
      <h1 className="page-title">Your safety inbox</h1>
      {!inbox ? (
        <p role="alert">Your private inbox is unavailable. Try again or use the contact in the guidelines.</p>
      ) : (
        <>
          <h2>Reports you made</h2>
          {!inbox[1].length && <p>You have no reports.</p>}
          {inbox[1].map((r) => (
            <article key={r.id} className="card">
              <strong>
                {r.targetKind} #{r.targetId}
              </strong>
              <p>
                {r.status === "open"
                  ? "Under review"
                  : r.status === "dismissed"
                    ? "No violation found"
                    : r.status === "corrected"
                      ? "The decision changed after an appeal."
                      : "A moderator acted on your report."}
              </p>
            </article>
          ))}
          <h2>Decisions about your participation</h2>
          {!inbox[0].length && <p>You have no decisions to review.</p>}
          {inbox[0].map((r) => (
            <article className="card" key={Number(r.id)}>
              <h3>{isDecision(r.action) ? decisions[r.action] : "Review decision"}</h3>
              <p>
                {isRule(r.rule) ? reportRules[r.rule] : "Community guidelines"} ·{" "}
                {new Date(String(r.created_at)).toLocaleDateString()}
              </p>
              {Boolean(r.evidence) && <blockquote>{String(r.evidence)}</blockquote>}
              {Boolean(r.restricted) && <p>Evidence is restricted to protect the people involved.</p>}
              {Boolean(r.ends_at) && (
                <p>
                  {r.action === "ban"
                    ? "Permanent restriction"
                    : `Until ${new Date(String(r.ends_at)).toLocaleString()}`}
                </p>
              )}
              {r.appeal ? (
                <p>
                  Appeal {String(r.appeal)}. {r.reason ? String(r.reason) : ""}
                </p>
              ) : (
                <AppealForm id={Number(r.id)} />
              )}
            </article>
          ))}
        </>
      )}
      <Link href="/guidelines">Community guidelines and contact</Link>
    </main>
  );
}
