import type { Metadata } from "next";
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

const ROOMS_TITLE = "Community Rooms — League of Legends Discussion & Champion Mains";
const ROOMS_DESCRIPTION = "Browse Baron Pit's League of Legends community rooms: a room for every champion's mains, " +
  "patch and meta discussion, off-meta builds, LFG and a welcome room for new players.";
export const metadata: Metadata = {
  title: ROOMS_TITLE,
  description: ROOMS_DESCRIPTION,
  alternates: { canonical: "/rooms" },
  openGraph: { title: ROOMS_TITLE, description: ROOMS_DESCRIPTION },
  twitter: { title: ROOMS_TITLE, description: ROOMS_DESCRIPTION },
};

export default async function RoomsPage({searchParams}: {searchParams: Promise<{q?: string; limit?: string}>}) {
  const [user, patch, params] = await Promise.all([getCurrentUser(), currentPatch(), searchParams]);
  const asOf = new Date();
  const rooms = await listRooms(user?.id).catch(() => null);
  if (rooms === null) return <div className="empty"><h1>Rooms</h1><p>The room directory is temporarily unavailable. Please try again shortly.</p></div>;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const limit = typeof params.limit === "string" && /^\d{1,4}$/.test(params.limit)
    ? Math.min(Number(params.limit), rooms.length) : 0;
  return (
    <div>
      <h1 className="page-title">Rooms</h1>
      <section id="room-directory" className={styles.directory} tabIndex={-1} aria-label="Room directory">
        <RoomDirectory key={JSON.stringify([query, limit])} rooms={rooms} patch={patch} signedIn={Boolean(user)} initialQuery={query} initialLimit={limit}/>
      </section>
      <h2 className={styles.heading}>Featured rooms</h2>
      <div>
        {featuredRooms(rooms).map(room => (
          <article key={room.id} className={styles.featuredRoom}>
              <RoomThumbnail slug={room.slug} asOf={asOf}/>
              <div className={styles.details}>
                <h3><Link href={`/rooms/${room.slug}`}>{room.name}</Link></h3>
                <RoomActivity name={room.name} members={room.members} latestPost={room.latestPost}/>
                {room.host && <small className="meta">Hosted by <Link href={`/u/${room.host.id}`}>{room.host.name}</Link></small>}
              </div>
              {user && <JoinButton roomId={room.id} initial={room.joined}/>}
          </article>
        ))}
      </div>
      <nav className={styles.related} aria-label="More in the community">
        <Link prefetch={false} href={user ? "/?tab=following" : signInHref("/rooms#room-directory")}>
          {user ? "Open Following" : "Sign in to join rooms"}
        </Link>
        <Link href="/questions">Match questions</Link>
        <Link href="/lfg">Find a duo</Link>
        <Link href="/pilot?from=community">Volunteer to answer</Link>
      </nav>
    </div>
  );
}
