import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { featuredRooms, listRooms } from "@/lib/rooms";
import { currentPatch } from "@/lib/riot";
import { JoinButton } from "@/components/social-ui";
import { RoomDirectory } from "@/components/rooms-ui";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const [user, patch] = await Promise.all([getCurrentUser(), currentPatch()]);
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
            <div className="list-row">
              <div>
                <h3><Link href={`/rooms/${room.slug}`}>{room.name}</Link></h3>
                <p className="meta">{room.description}</p>
                {room.host && <span className="meta">Hosted by <Link href={`/u/${room.host.id}`}>{room.host.name}</Link></span>}
              </div>
              {user && <JoinButton roomId={room.id} initial={room.joined}/>}
            </div>
          </article>
        ))}
      </div>
      <p><Link href="/pilot?from=community">Volunteer to answer player questions</Link></p>
      <h2 className="section">Room directory</h2>
      <RoomDirectory rooms={rooms} patch={patch} signedIn={Boolean(user)}/>
      <p><Link href="/lfg">Find a duo</Link></p>
    </div>
  );
}
