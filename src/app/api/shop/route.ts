import { buildCatalog } from "@/lib/build-catalog";
import { confirmedPatch } from "@/lib/riot";

export async function GET() {
  const currentPatch = await confirmedPatch();
  const catalog = await buildCatalog(currentPatch ?? undefined);
  const choices = catalog.items.filter(item => item.shop).map(({ id, name }) => ({ id, name }));
  const items: Record<string, number> = {};
  for (const { name, id } of choices) items[name] ??= id;
  return Response.json(
    { patch: catalog.patch, current: catalog.patch === currentPatch, items, choices,
      keystones: catalog.runes.filter(r => r.slot === 0).map(({ id, name, tree }) => ({ id, name, tree })) },
    { headers: { "Cache-Control": "public, s-maxage=300" } },
  );
}
