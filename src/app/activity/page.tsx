import Link from "next/link";
import { Suspense } from "react";
import { RouteLoading } from "@/components/route-loading";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { replyActivity, watchedDiscussions, pageCursor } from "@/lib/discussion-library";
import { signInHref } from "@/lib/signin-return";
import { DiscussionList } from "@/components/discussion-library-list";
import { DuoReminder } from "@/components/duo-reminder";
import { DuoCancelButton } from "@/components/duo-cancel-button";
import { duoEnabled } from "@/lib/duo";
import { hasIncomingDuoRequest, privateDuoActivity, type DuoActivityItem } from "@/lib/duo-activity";

export const metadata = { title: "Activity", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; tab?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const duos = params.tab === "duos";
  const listTab = params.tab === "muted" || params.tab === "watching" ? params.tab : null;
  const before = duos ? null : pageCursor(params.before);
  const tab = duos ? "duos" : listTab ?? "replies";
  const latest = tab === "replies" ? "/activity" : "/activity?tab=" + tab;
  const query = new URLSearchParams();
  if (tab !== "replies") query.set("tab",tab);
  if (before) query.set("before",before);
  if (!user) redirect(signInHref(query.size ? "/activity?" + query : "/activity"));

  return <section>
    <h1 className="page-title">Activity</h1>
    <nav className="tabs" aria-label="Activity">
      {([["replies","Replies"],["watching","Watching"],["muted","Muted"],["duos","Duos"]] as const).map(([value,label]) =>
        <Link key={value} href={value === "replies" ? "/activity" : "/activity?tab=" + value}
          className={tab === value ? "active" : undefined} aria-current={tab === value ? "page" : undefined}
          aria-label={value === "duos" ? "Duo invitations" : undefined}>{label}</Link>)}
    </nav>
    {before && <Link className="text-btn" href={latest}>Back to latest {tab === "replies" ? "replies" : "threads"}</Link>}
    <Suspense key={tab + (before ?? "")} fallback={<RouteLoading label="Loading activity…"/>}>
      <ActivityResults tab={tab} userId={user.id} before={before}/>
    </Suspense>
  </section>;
}

async function ActivityResults({ tab, userId, before }: {
  tab: "replies" | "watching" | "muted" | "duos"; userId: number; before: string | null;
}) {
  if (tab === "duos") return <InvitationList invites={await privateDuoActivity(userId).catch(() => null)}/>;
  const [page, pending] = await Promise.all([
    (tab === "replies" ? replyActivity(userId,before) : watchedDiscussions(userId,before,tab === "muted" ? "muted" : "all")).catch(() => null),
    hasIncomingDuoRequest(userId).catch(() => false),
  ]);
  if (!page) return <p role="alert">Your activity couldn’t load. Please try again.</p>;
  return <>
    {pending && <p><Link href="/activity?tab=duos">Review a waiting duo invitation</Link></p>}
    {tab === "muted" && <h2 className="section">Muted threads</h2>}
    {before && !page.entries.length ? <p className="meta">You’ve reached the end.</p> :
      <DiscussionList page={page} view={tab}/>}
    {!before && !page.entries.length && (tab === "replies" || tab === "watching") &&
      <Link className="text-btn" href={tab === "replies" ? "/questions" : "/"}>{tab === "replies" ? "Explore match questions" : "Browse discussions"}</Link>}
  </>;
}

function InvitationList({ invites }: { invites: DuoActivityItem[] | null }) {
  if (!duoEnabled())
    return (
      <p>
        Verified matching is paused. <Link href="/lfg#duo-plan">Manage your private duo plan</Link>.
      </p>
    );
  if (!invites) return <p role="alert">Your invitations couldn’t load. Try again shortly.</p>;
  if (!invites.length)
    return (
      <p>
        No recent duo invitations. <Link href="/lfg">Open Duo Finder</Link>.
      </p>
    );
  return (
    <ul className="plain-list">
      {invites.map((item) => {
        const heading =
          item.state === "cancelled"
            ? "Duo booking canceled"
            : item.state === "expired"
            ? "Invitation expired"
            : item.state === "accepted"
              ? "Duo invitation accepted"
              : item.incoming
                ? "Incoming duo invitation"
                : "Your outgoing invitation";
        return (
          <li key={item.id} className="list-row">
            <div>
              <strong>{heading}</strong>
              <p className="meta">
                {item.state === "cancelled" ? "Contact sharing for this booking ended." : item.listingEnded && !item.canCancel ? "This listing has ended." : (
                  <>{item.canCancel ? "Booking ends" : "Listing closes"} <time dateTime={item.expiresAt}>{new Date(item.expiresAt).toUTCString()}</time></>
                )}
              </p>
              {item.listingEnded && item.state === "accepted" && <Link href="/lfg">Open Duo Finder</Link>}
              {!item.listingEnded && (
                <Link href={"/lfg#duo-request-" + item.id}>
                  {item.state === "pending" && item.incoming ? "Review invitation" : "View request"}
                </Link>
              )}
              {item.reminderStart && <><p className="meta">Session starts <time dateTime={item.reminderStart}>{new Date(item.reminderStart).toUTCString()}</time></p><DuoReminder id={item.id}/></>}
              {item.canCancel && <DuoCancelButton id={item.id} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
