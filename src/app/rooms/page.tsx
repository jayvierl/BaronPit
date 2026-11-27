import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { featuredRooms, listRooms } from "@/lib/rooms";
import { currentPatch } from "@/lib/riot";
import { JoinButton } from "@/components/social-ui";
import { RoomDirectory } from "@/components/rooms-ui";
import { RoomActivity, RoomThumbnail } from "@/components/room-artwork";
import { signInHref } from "@/lib/signin-return";
import styles from "./rooms.module.css";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const [user, patch] = await Promise.all([getCurrentUser(), currentPatch()]);
  const asOf = new Date();
  const rooms = await listRooms(user?.id).catch(() => null);
  if (rooms === null) return <div className="empty"><h1>Rooms</h1><p>The room directory is temporarily unavailable. Please try again shortly.</p></div>;
  return (
    <div>
      <h1 className="page-title">Rooms</h1>
      <p className="meta">Discuss a recent game, compare builds or <Link href="/questions">find a matchup question</Link>.</p>
      <h2 className="section">Featured rooms</h2>
      <div className="room-grid">
        {featuredRooms(rooms).map(room => (
          <article key={room.id} className="card room-card">
            <div className={styles.featuredRoom}>
              <RoomThumbnail slug={room.slug} asOf={asOf}/>
              <div className={styles.details}>
                <h3><Link href={`/rooms/${room.slug}`}>{room.name}</Link></h3>
                <p className="meta">{room.description}</p>
                <RoomActivity name={room.name} members={room.members} latestPost={room.latestPost}/>
                {room.host && <small className="meta">Hosted by <Link href={`/u/${room.host.id}`}>{room.host.name}</Link></small>}
              </div>
              {user && <JoinButton roomId={room.id} initial={room.joined}/>}
            </div>
          </article>
        ))}
      </div>
      <p><Link href="/pilot?from=community">Volunteer to answer player questions</Link></p>
      <h2 id="room-directory" tabIndex={-1} className={`section ${styles.directoryAnchor}`}>Room directory</h2>
      <p className="meta">Join rooms for champions and topics you like. Their posts appear in your Following feed.</p>
      <p><Link prefetch={false} className="text-btn" href={user ? "/?tab=following" : signInHref("/rooms#room-directory")}>
        {user ? "Open Following" : "Sign in to join rooms"}
      </Link></p>
      <RoomDirectory rooms={rooms} patch={patch} signedIn={Boolean(user)}/>
      <p><Link href="/lfg">Find a duo</Link></p>
    </div>
  );
}
