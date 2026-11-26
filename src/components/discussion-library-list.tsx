import Link from "next/link";
import type { LibraryPage } from "@/lib/discussion-library";
import { LibraryRowAction } from "./discussion-library-actions";

type View = "playbook" | "replies" | "watching" | "muted";
const emptyText: Record<View,string> = {
  playbook: "Save a discussion or an individual reply to find it here.",
  watching: "Choose All replies in a thread’s notification settings to watch it.",
  muted: "Your muted threads will appear here.",
  replies: "Replies to your posts and comments appear here. You can also watch all replies in a thread.",
};
const rowAction = { playbook: "remove", watching: "unwatch", muted: "unmute", replies: "read" } as const;
const replyLabels = { post: " replied to your post", comment: " replied to your comment", watch: " replied in a thread you watch" };

export function DiscussionList({ page, view, olderHref }: { page: LibraryPage; view: View; olderHref?: string }) {
  const base = view === "playbook" ? "/playbook?" : view === "replies" ? "/activity?" : "/activity?tab=" + view + "&";
  return <>
    {page.entries.length === 0 && <p className="meta">{emptyText[view]}</p>}
    <ul className="library-list">
      {page.entries.map(item => <li key={item.cursor}>
        <div className="meta">
          {!item.replyReason && (item.kind === "comment" ? "Reply by " : "Discussion by ")}
          <Link href={`/u/${item.authorId}`}>{item.author}</Link>
          {item.replyReason && replyLabels[item.replyReason]}{item.unread && <strong> · Unread</strong>}
        </div>
        <Link href={`/post/${item.postId}${item.kind === "comment" ? "#reply-" + item.id : ""}`}>{item.excerpt}</Link>
        {(view !== "replies" || item.unread) && <div><LibraryRowAction kind={item.kind} id={item.id}
          action={rowAction[view]} /></div>}
        {view === "replies" && <LibraryRowAction kind="post" id={item.postId} action="mute" />}
      </li>)}
    </ul>
    {page.next && <Link href={olderHref ?? (base + "before=" + page.next)}>Older {view === "replies" ? "replies" : "items"}</Link>}
  </>;
}
