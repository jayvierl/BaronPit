import { currentBuildCatalog } from "@/lib/build-catalog";

export async function GET() {
  const { catalog, current } = await currentBuildCatalog();
  const choices = catalog.items.filter(item => item.shop).map(({ id, name }) => ({ id, name }));
  const items: Record<string, number> = {};
  for (const { name, id } of choices) items[name] ??= id;
  return Response.json(
    { patch: catalog.patch, current, items, choices,
      keystones: catalog.runes.filter(r => r.slot === 0).map(({ id, name, tree }) => ({ id, name, tree })) },
    { headers: { "Cache-Control": current ? "public, s-maxage=300" : "no-store" } },
  );
}
