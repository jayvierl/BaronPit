import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { replyActivity, watchedDiscussions, pageCursor } from "@/lib/discussion-library";
import { signInHref } from "@/lib/signin-return";
import { DiscussionList } from "@/components/discussion-library-list";
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
  const watching = params.tab === "watching";
  const before = duos ? null : pageCursor(params.before);
  if (!user) {
    const query = new URLSearchParams();
    if (duos || watching) query.set("tab", duos ? "duos" : "watching");
    if (before) query.set("before", before);
    redirect(signInHref(query.size ? "/activity?" + query : "/activity"));
  }
  const [page, invites, pending] = await Promise.all([
    duos
      ? null
      : (watching ? watchedDiscussions : replyActivity)(user.id, before).catch(() => null),
    duos ? privateDuoActivity(user.id).catch(() => null) : null,
    duos ? false : hasIncomingDuoRequest(user.id).catch(() => false),
  ]);
  return (
    <section className="card">
      <h1>Activity</h1>
      <nav className="tabs" aria-label="Activity">
        <Link
          href="/activity"
          aria-current={!duos && !watching ? "page" : undefined}
          className={!duos && !watching ? "active" : undefined}
        >
          Replies
        </Link>
        <Link
          href="/activity?tab=watching"
          aria-current={watching ? "page" : undefined}
          className={watching ? "active" : undefined}
        >
          Watching
        </Link>
        {(duoEnabled() || duos) && (
          <Link
            href="/activity?tab=duos"
            aria-current={duos ? "page" : undefined}
            className={duos ? "active" : undefined}
          >
            Duo invitations{pending ? " · waiting" : ""}
          </Link>
        )}
      </nav>
      {duos ? (
        <InvitationList invites={invites} />
      ) : page ? (
        <DiscussionList page={page} view={watching ? "watching" : "replies"} />
      ) : (
        <p role="alert">Your activity couldn’t load. Please try again.</p>
      )}
    </section>
  );
}

function InvitationList({ invites }: { invites: DuoActivityItem[] | null }) {
  if (!duoEnabled())
    return (
      <p>
        Verified matching is paused. <Link href="/lfg">Manage your private duo plan</Link>.
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
          item.state === "expired"
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
                {item.listingEnded ? "This listing has ended." : (
                  <>Listing closes <time dateTime={item.expiresAt}>{new Date(item.expiresAt).toUTCString()}</time></>
                )}
              </p>
              {item.listingEnded && item.state === "accepted" && <Link href="/lfg">Open Duo Finder</Link>}
              {!item.listingEnded && (
                <Link href={"/lfg#duo-request-" + item.id}>
                  {item.state === "pending" && item.incoming ? "Review invitation" : "View request"}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
