import Link from "next/link";
import { SafetyReport } from "@/components/safety-report";
import { RichBody, timeAgo } from "@/components/ui";
import { profileReplies } from "@/lib/profile-replies";
import { pageCursor } from "@/lib/discussion-library";
import styles from "./profile.module.css";

export async function ProfileReplies({ authorId, viewerId, before }: {
  authorId: number; viewerId: number | null; before?: string;
}) {
  const cursor = pageCursor(before);
  const page = await profileReplies(authorId, viewerId, cursor).catch(() => null);
  const firstPage = `/u/${authorId}?tab=replies`;
  if (!page) return <p role="status" className={styles.empty}>Replies are temporarily unavailable. <Link href={firstPage}>Try again</Link></p>;
  if (!page.replies.length) return <div className={styles.empty}>
    <h2>{cursor ? "No older replies" : "No public replies yet"}</h2>
    {cursor ? <Link className={styles.link} href={firstPage}>Back to latest replies</Link>
      : <Link className={styles.link} href="/rooms">Browse community rooms</Link>}
  </div>;

  return <section aria-label="Public replies">
    {page.replies.map(reply => {
      const href = `/post/${reply.postId}#reply-${reply.id}`;
      return <article className={styles.reply} key={reply.id}>
        <div className={styles.replyByline}>
          <span>Replying to <strong>{reply.recipient}</strong>{reply.room && <> · {reply.room}</>}</span>
          <time dateTime={reply.createdAt} title={new Date(reply.createdAt).toUTCString()}>{timeAgo(reply.createdAt)}</time>
        </div>
        <RichBody body={reply.body}/>
        <div className={styles.replyActions}>
          <Link href={href}>View conversation <span aria-hidden="true">↗</span></Link>
          {viewerId !== authorId && <SafetyReport kind="comment" targetId={reply.id}/>}
        </div>
      </article>;
    })}
    {(page.next || cursor) && <nav className={styles.replyPages} aria-label="Reply pages">
      {cursor && <Link href={firstPage}>Latest replies</Link>}
      {page.next && <Link href={`${firstPage}&before=${page.next}`}>Older replies</Link>}
    </nav>}
  </section>;
}
