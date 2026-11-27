import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { savedPlaybook, pageCursor } from "@/lib/discussion-library";
import { decisionCursor } from "@/lib/decisions-input";
import { myDecisionProgress } from "@/lib/decisions";
import { signInHref } from "@/lib/signin-return";
import { DiscussionList } from "@/components/discussion-library-list";
import { DuoShortlist } from "@/components/duo-shortlist";
import { duoShortlist } from "@/lib/duo-shortlist";
import { MyProgress, progressPath } from "./progress";

export const metadata = { title: "Saved", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Tab = "all" | "posts" | "replies" | "duos" | "progress";
function savedPath(tab: Tab, before?: string | null) {
  const query = new URLSearchParams();
  if (tab !== "all") query.set("tab", tab);
  if (before) query.set("before", before);
  return query.size ? "/playbook?" + query : "/playbook";
}

export default async function Playbook({ searchParams }: { searchParams: Promise<{ before?: string; tab?: string; stage?: string }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const tab = params.tab === "posts" || params.tab === "replies" || params.tab === "duos" || params.tab === "progress" ? params.tab : "all";
  const before = tab === "duos" || tab === "progress" ? null : pageCursor(params.before);
  const progressBefore = tab === "progress" ? decisionCursor(params.before) : null;
  const ready = tab === "progress" && params.stage === "ready";
  const path = tab === "progress" ? progressPath(ready,progressBefore) : savedPath(tab, before);
  if (!user) redirect(signInHref(path));
  const kind = tab === "posts" ? "post" : tab === "replies" ? "comment" : undefined;
  const page = tab === "duos" || tab === "progress" ? null : await savedPlaybook(user.id, before, kind).catch(() => null);
  const shortlist = tab === "duos" ? await duoShortlist(user.id).catch(() => null) : null;
  const progress = tab === "progress" ? await myDecisionProgress(user.id,progressBefore,ready).catch(() => null) : null;
  const canParticipate = user.termsCurrent && !isBanned(user) && process.env.SAFETY_PAUSE_PUBLICATION !== "true";

  return <section>
    <h1 className="page-title">{tab === "progress" ? "My progress" : "Saved"}</h1>
    {tab !== "duos" && tab !== "progress" && <p className="meta">Only you can see your saved posts and replies.</p>}
    <nav className="tabs" aria-label="Saved views">
      {([["all", "All"], ["posts", "Posts"], ["replies", "Replies"], ["duos", "Duos"], ["progress", "My progress"]] as const).map(([value, label]) =>
        <Link key={value} href={savedPath(value)} prefetch={value === "progress" ? false : undefined} className={tab === value ? "active" : undefined}
          aria-current={tab === value ? "page" : undefined}>{label}</Link>)}
    </nav>
    {before && <Link className="text-btn" href={savedPath(tab)}>Back to latest saves</Link>}
    {tab === "progress" ? <MyProgress page={progress} before={progressBefore} ready={ready} canParticipate={canParticipate}/>
      : tab === "duos" ? (shortlist ? <DuoShortlist {...shortlist}/>
      : <p role="alert">Your Duo shortlist couldn’t load. <a href={path}>Try again</a></p>)
      : !page ? <p role="alert">Saved items couldn’t load. <a href={path}>Try again</a></p>
      : page.entries.length ? <DiscussionList page={page} view="playbook" olderHref={page.next ? savedPath(tab, page.next) : undefined}/>
      : before ? <p className="meta">You’ve reached the end.</p>
      : <div className="empty">
          <p>{tab === "replies" ? "Save a helpful reply from its conversation." : tab === "posts" ? "Save a post with the bookmark button below it." : "Save posts and replies to revisit them here."}</p>
          <Link href="/">Browse the feed</Link>
        </div>}
  </section>;
}
