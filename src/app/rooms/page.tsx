import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listRooms } from "@/lib/social";
import { currentPatch } from "@/lib/riot";
import { JoinButton } from "@/components/social-ui";
import { ChampionRooms } from "@/components/rooms-ui";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const user = await getCurrentUser().catch(() => null);
  const rooms = await listRooms(user?.id).catch(() => []);
  const patch = await currentPatch();
  const general = rooms.filter((r) => r.kind === "general");
  const champs = rooms.filter((r) => r.kind === "champion");
  return (
    <div>
      <h1 className="page-title">Rooms</h1>
      <p className="meta" style={{ maxWidth: 640 }}>
        Broad rooms for everyone, and a room for every champion — the room pulse keeps quieter rooms alive with
        live form from their mains. Linking your Riot ID auto-joins you to your top champions&apos; rooms.
      </p>
      <p style={{ fontSize: 15 }}>
        Looking for a game right now? <Link href="/lfg" style={{ fontWeight: 600 }}>Find a Duo →</Link>
      </p>
      <h2 className="section">The house</h2>
      <div className="room-grid">
        {general.map((r) => (
          <div key={r.id} className="card room-card">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="room-tile">{r.name.charAt(0)}</span>
              <Link href={`/rooms/${r.slug}`}><h3>{r.name}</h3></Link>
            </div>
            <p className="meta" style={{ margin: "8px 0 10px" }}>{r.description}</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="meta">{r.members} member{r.members === 1 ? "" : "s"}</span>
              {user && <JoinButton roomId={r.id} initial={r.joined} />}
            </div>
          </div>
        ))}
      </div>
      <h2 className="section">Champion rooms</h2>
      <ChampionRooms rooms={champs} patch={patch} signedIn={Boolean(user)} />
    </div>
  );
}
