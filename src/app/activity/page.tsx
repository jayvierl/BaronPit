import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { replyActivity, watchedDiscussions, pageCursor } from "@/lib/discussion-library";
import { signInHref } from "@/lib/signin-return";
import { DiscussionList } from "@/components/discussion-library-list";

export const metadata = { title: "Reply activity", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Activity({ searchParams }: { searchParams: Promise<{ before?: string; tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(signInHref("/activity"));
  const params = await searchParams;
  const watching = params.tab === "watching";
  const page = await (watching ? watchedDiscussions : replyActivity)(user.id, pageCursor(params.before)).catch(() => null);
  return <section className="card"><h1>Reply activity</h1>
    <nav className="tabs" aria-label="Reply activity"><Link href="/activity" className={!watching ? "active" : undefined} aria-current={!watching ? "page" : undefined}>Replies</Link>
      <Link href="/activity?tab=watching" className={watching ? "active" : undefined} aria-current={watching ? "page" : undefined}>Watching</Link></nav>
    {page ? <DiscussionList page={page} view={watching ? "watching" : "replies"} /> : <p role="alert">Your activity couldn’t load. Please try again.</p>}
  </section>;
}
