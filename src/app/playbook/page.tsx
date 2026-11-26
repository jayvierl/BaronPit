import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { savedPlaybook, pageCursor } from "@/lib/discussion-library";
import { signInHref } from "@/lib/signin-return";
import { DiscussionList } from "@/components/discussion-library-list";

export const metadata = { title: "Saved", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Tab = "all" | "posts" | "replies";
function savedPath(tab: Tab, before?: string | null) {
  const query = new URLSearchParams();
  if (tab !== "all") query.set("tab", tab);
  if (before) query.set("before", before);
  return query.size ? "/playbook?" + query : "/playbook";
}

export default async function Playbook({ searchParams }: { searchParams: Promise<{ before?: string; tab?: string }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const tab = params.tab === "posts" || params.tab === "replies" ? params.tab : "all";
  const before = pageCursor(params.before);
  const path = savedPath(tab, before);
  if (!user) redirect(signInHref(path));
  const kind = tab === "posts" ? "post" : tab === "replies" ? "comment" : undefined;
  const page = await savedPlaybook(user.id, before, kind).catch(() => null);

  return <section>
    <h1 className="page-title">Saved</h1>
    <p className="meta">Only you can see your saved posts and replies.</p>
    <nav className="tabs" aria-label="Saved discussions">
      {([["all", "All"], ["posts", "Posts"], ["replies", "Replies"]] as const).map(([value, label]) =>
        <Link key={value} href={savedPath(value)} className={tab === value ? "active" : undefined}
          aria-current={tab === value ? "page" : undefined}>{label}</Link>)}
    </nav>
    {before && <Link className="text-btn" href={savedPath(tab)}>Back to latest saves</Link>}
    {!page ? <p role="alert">Saved items couldn’t load. <a href={path}>Try again</a></p>
      : page.entries.length ? <DiscussionList page={page} view="playbook" olderHref={page.next ? savedPath(tab, page.next) : undefined}/>
      : before ? <p className="meta">You’ve reached the end.</p>
      : <div className="empty">
          <p>{tab === "replies" ? "Save a helpful reply from its conversation." : tab === "posts" ? "Save a post with the bookmark button below it." : "Save posts and replies to revisit them here."}</p>
          <Link href="/">Browse the feed</Link>
        </div>}
  </section>;
}
