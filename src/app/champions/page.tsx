import { publicPatch } from "@/lib/patch-notes";
import { ChampionDirectory } from "@/components/champion-directory";
import { championDirectoryFilters } from "@/lib/champion-navigation";
import { championCatalog } from "@/lib/riot";
import { visibleChampionRoomSlugs } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export default async function ChampionsPage({ searchParams }: {
  searchParams?: Promise<{ q?: string | string[]; class?: string | string[] }>;
} = {}) {
  const [catalog, roomSlugs, params] = await Promise.all([championCatalog(), visibleChampionRoomSlugs().catch(() => []), searchParams]);
  return (
    <div>
      <h1 className="page-title">Champions</h1>
      <p className="meta">
        {catalog.current ? "Current patch" : "Last available Data Dragon catalog"} {publicPatch(catalog.patch) ?? "unavailable"} ·{" "}
        {catalog.list.length} champions.
      </p>
      <ChampionDirectory champions={catalog.list} patch={catalog.patch} roomSlugs={roomSlugs}
        initial={championDirectoryFilters(params?.q, params?.class)} />
    </div>
  );
}
