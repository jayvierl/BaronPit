import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { currentPatch } from "@/lib/riot";
import { buildFeed, getPost } from "@/lib/social";
import { validId } from "@/lib/ids";
import { buildCatalog } from "@/lib/build-catalog";
import { examplePaths, pathFromPost } from "@/lib/build-comparison";
import { BuildCompare } from "@/components/build-compare";

export const dynamic = "force-dynamic";
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ build?: string; item?: string }>;
}) {
  const [{ build, item }, user, patch] = await Promise.all([searchParams, getCurrentUser(), currentPatch()]);
  const [catalog, community, target] = await Promise.all([
    buildCatalog(patch),
    buildFeed(user, {}).catch(() => null),
    typeof build === "string" && /^[1-9]\d{0,9}$/.test(build) && validId(Number(build))
      ? getPost(Number(build), user).catch(() => null)
      : null,
  ]);
  const items = catalog.items
    .filter((i) => i.shop)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const shopIds = new Set(items.map((i) => i.id));
  const builds = new Map((community ?? []).map((p) => [p.id, p]));
  if (target) builds.set(target.id, target);
  const choices = [
    ...examplePaths(items, catalog.runes),
    ...Array.from(builds.values()).flatMap((p) => pathFromPost(p, shopIds) ?? []),
  ];
  const selectedItem = items.find((i) => i.id === Number(item));
  if (selectedItem)
    choices.unshift({
      key: "selected-item",
      title: selectedItem.name,
      items: [selectedItem.id],
      runes: [],
      secondaryTree: "",
      runeNotes: "",
      rationale: "Compare this item with another path for the same opponents.",
    });
  choices.push({
    key: "custom",
    title: "Start empty",
    rationale: "Choose items and runes for the matchup.",
    items: [],
    runes: [],
    runeNotes: "",
    secondaryTree: "",
  });
  return (
    <div>
      <Link href="/builds">Builds</Link>
      <h1 className="page-title">Compare build paths</h1>
      <p>
        Try two item and rune paths against the same opponents. Start with a support example or a community
        build, then adjust either side.
      </p>
      <p className="meta">
        Shop costs and effects from Riot Data Dragon {catalog.patch}.
        {catalog.patch !== patch && ` The latest catalog for ${patch} is unavailable.`}
      </p>
      {community === null && (
        <p className="notice">
          Community builds are temporarily unavailable. You can still compare shop items.
        </p>
      )}
      {build && !choices.some((p) => p.key === build) && (
        <p className="notice">This build is unavailable for comparison with the current shop.</p>
      )}
      <BuildCompare
        choices={choices}
        items={items}
        runes={catalog.runes}
        initial={selectedItem ? "selected-item" : build}
      />
    </div>
  );
}
