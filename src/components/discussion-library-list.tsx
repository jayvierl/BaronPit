import Link from "next/link";
import type { LibraryPage } from "@/lib/discussion-library";
import { LibraryRowAction } from "./discussion-library-actions";

type View = "playbook" | "replies" | "watching";

export function DiscussionList({ page, view }: { page: LibraryPage; view: View }) {
  const base = view === "playbook" ? "/playbook?" : view === "watching" ? "/activity?tab=watching&" : "/activity?";
  return <>
    {page.entries.length === 0 && <p className="meta">{view === "playbook" ? "Save a discussion or an individual reply to find it here." :
      view === "watching" ? "Choose Watch replies on a discussion to follow the conversation." : "New replies from other players will appear here when you watch a discussion."}</p>}
    <ul className="library-list">
      {page.entries.map(item => <li key={item.cursor}>
        <div className="meta">{item.kind === "comment" ? "Reply" : "Discussion"} by {item.author}{item.unread && <strong> · Unread</strong>}</div>
        <Link href={`/post/${item.postId}${item.kind === "comment" ? "#reply-" + item.id : ""}`}>{item.excerpt}</Link>
        {(view !== "replies" || item.unread) && <div><LibraryRowAction kind={item.kind} id={item.id}
          action={view === "playbook" ? "save" : view === "watching" ? "watch" : "read"} /></div>}
      </li>)}
    </ul>
    {page.next && <Link href={base + "before=" + page.next}>Older {view === "replies" ? "replies" : "items"}</Link>}
  </>;
}
