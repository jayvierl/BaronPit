import Link from "next/link";
import { activeStarterRoom, followingStarter } from "@/lib/following-starter";
import { FollowButton, JoinButton } from "./social-ui";
import { SafetyReport } from "./safety-report";
import styles from "./following-starter.module.css";

type StarterRoom = { id: number; name: string; slug: string; joined: boolean; members: number };

export async function FollowingStarter({userId, rooms}: {userId: number; rooms: StarterRoom[]}) {
  const question = await followingStarter(userId).catch(() => null);
  const active = question ? null : await activeStarterRoom(userId).catch(() => null);
  const room = active ?? rooms.filter(r => !r.joined).sort((a,b) => b.members - a.members)[0];
  return <section aria-labelledby="following-start" className={styles.starter}>
    <h2 id="following-start">Make this feed yours</h2>
    <p>Follow players or join a room to see their posts here.</p>
    {question ? <article>
      <div className={styles.row}><Link href={`/u/${question.authorId}`}>{question.author}</Link><FollowButton userId={question.authorId} initial={false}/></div>
      <span className="meta">{question.role} · {question.champion} · Awaiting a reply</span>
      <p className={styles.preview}><Link href={`/post/${question.id}`}>{question.body}</Link></p>
      <div className={styles.row}><Link href={`/post/${question.id}`}>Join the conversation</Link><SafetyReport kind="post" targetId={question.id}/></div>
    </article> : room ? <div className={styles.row}><Link href={`/rooms/${room.slug}`}>{room.name}</Link><JoinButton roomId={room.id} initial={false}/></div> : null}
    <Link href="/rooms" className="text-btn">Browse rooms</Link>
  </section>;
}
