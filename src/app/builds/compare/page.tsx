import { publicPatch } from "@/lib/patch-notes";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { buildFeed, getPost } from "@/lib/social";
import { validId } from "@/lib/ids";
import { currentBuildCatalog } from "@/lib/build-catalog";
import { buildItemId } from "@/lib/build-sharing";
import { examplePaths, pathFromPost } from "@/lib/build-comparison";
import { BuildCompare } from "@/components/build-compare";

export const dynamic = "force-dynamic";
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ build?: string; item?: string }>;
}) {
  const shop = currentBuildCatalog();
  const [{ build, item }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const [{ catalog, current }, community, target] = await Promise.all([
    shop,
    buildFeed(user, {}).catch(() => null),
    typeof build === "string" && /^[1-9]\d{0,9}$/.test(build) && validId(Number(build))
      ? getPost(Number(build), user).catch(() => null)
      : null,
  ]);
  const items = catalog.items
    .filter((i) => i.shop)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const shopIds = new Set(items.map((i) => i.id));
  const keystoneIds = new Set(catalog.runes.filter(rune => rune.slot === 0).map(rune => rune.id));
  const builds = new Map((community ?? []).map((p) => [p.id, p]));
  if (target) builds.set(target.id, target);
  const choices = [
    ...examplePaths(items, catalog.runes),
    ...Array.from(builds.values()).flatMap((p) => pathFromPost(p, shopIds, keystoneIds) ?? []),
  ];
  const requestedItem = buildItemId(item);
  const selectedItem = items.find((i) => i.id === requestedItem);
  if (selectedItem)
    choices.unshift({
      key: "selected-item",
      title: selectedItem.name,
      items: [selectedItem.id],
      runes: [],
      secondaryTree: "",
      runeNotes: "",
      rationale: "Start one path with this item, then add the rest of the build.",
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
        Compare shop costs and rune effects. Add a matchup as a note.
      </p>
      <p className="meta">
        Shop costs and effects from Riot for patch {publicPatch(catalog.patch) ?? "unavailable"}.
        {!current && " Riot’s current shop could not be verified. This comparison uses the last available catalog."}
      </p>
      {community === null && (
        <p className="notice">
          Community builds are temporarily unavailable. You can still compare shop items.
        </p>
      )}
      {requestedItem && !selectedItem && <p className="notice">This item is unavailable in the comparison catalog.</p>}
      {build && !choices.some((p) => p.key === build) && (
        <p className="notice">This build is unavailable for comparison with this shop catalog.</p>
      )}
      <BuildCompare
        key={`${catalog.patch}/${selectedItem?.id ?? build ?? "default"}`}
        choices={choices}
        items={items}
        runes={catalog.runes}
        initial={selectedItem ? "selected-item" : build}
      />
    </div>
  );
}
