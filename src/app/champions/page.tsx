import { ChampionDirectory } from "@/components/champion-directory";
import { championCatalog } from "@/lib/riot";
import { visibleChampionRoomSlugs } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export default async function ChampionsPage() {
  const [catalog, roomSlugs] = await Promise.all([championCatalog(), visibleChampionRoomSlugs().catch(() => [])]);
  return (
    <div>
      <h1 className="page-title">Champions</h1>
      <p className="meta">
        {catalog.current ? "Current patch" : "Last available Data Dragon catalog"} {catalog.patch} ·{" "}
        {catalog.list.length} champions.
      </p>
      <ChampionDirectory champions={catalog.list} patch={catalog.patch} roomSlugs={roomSlugs} />
    </div>
  );
}
