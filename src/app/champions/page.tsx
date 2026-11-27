import type { Metadata } from "next";
import Link from "next/link";
import { publicPatch } from "@/lib/patch-notes";
import { ChampionDirectory } from "@/components/champion-directory";
import { championDirectoryFilters } from "@/lib/champion-navigation";
import { championCatalog } from "@/lib/riot";
import { visibleChampionRoomSlugs } from "@/lib/rooms";
import { readSearchReturn } from "@/lib/search-scopes";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await championCatalog();
  const patch = publicPatch(catalog.patch);
  return {
    title: "League of Legends Champions — Directory, Abilities & Rooms",
    description: `Browse all ${catalog.list.length} League of Legends champions${patch ? ` on patch ${patch}` : ""}: ` +
      "ability details, classes, community builds and a discussion room for every champion.",
    alternates: { canonical: "/champions" },
  };
}

export default async function ChampionsPage({ searchParams }: {
  searchParams?: Promise<{ q?: string | string[]; class?: string | string[]; from?: string | string[] }>;
} = {}) {
  const [catalog, roomSlugs, params] = await Promise.all([championCatalog(), visibleChampionRoomSlugs().catch(() => []), searchParams]);
  const searchReturn = readSearchReturn(params?.from);
  return (
    <div>
      {searchReturn && <Link href={searchReturn} prefetch={false}>← Back to search</Link>}
      <h1 className="page-title">Champions</h1>
      <p className="meta">
        {catalog.current ? "Current patch" : "Last available Data Dragon catalog"} {publicPatch(catalog.patch) ?? "unavailable"} ·{" "}
        {catalog.list.length} champions.
      </p>
      <ChampionDirectory champions={catalog.list} patch={catalog.patch} roomSlugs={roomSlugs}
        initial={championDirectoryFilters(params?.q, params?.class)} searchReturn={searchReturn} />
    </div>
  );
}
