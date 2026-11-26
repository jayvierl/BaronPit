import { ChampionDirectory } from "@/components/champion-directory";
import { championCatalog } from "@/lib/riot";

export const dynamic = "force-static";
export const revalidate = 3600;

export default async function ChampionsPage() {
  const catalog = await championCatalog();
  return (
    <div>
      <h1 className="page-title">Champions</h1>
      <p className="meta">
        {catalog.current ? "Current patch" : "Last available Data Dragon catalog"} {catalog.patch} ·{" "}
        {catalog.list.length} champions.
      </p>
      <ChampionDirectory champions={catalog.list} patch={catalog.patch} />
    </div>
  );
}
