import { buildCatalog } from "@/lib/build-catalog";

export async function GET() {
  const catalog = await buildCatalog();
  const items: Record<string, number> = {};
  for (const item of catalog.items) {
    if (item.shop) items[item.name] ??= item.id;
  }
  return Response.json(
    { patch: catalog.patch, items },
    { headers: { "Cache-Control": "public, s-maxage=300" } },
  );
}
