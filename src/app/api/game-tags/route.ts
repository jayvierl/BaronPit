import { buildCatalog } from "@/lib/build-catalog";
import { championCatalog } from "@/lib/riot";

/**
 * Champion + item catalog for post tagging: composer autocomplete and the
 * hover/tap detail cards. Mirrors /api/shop's shape and caching; the
 * catalogs themselves come from the shared Data Dragon loaders, which
 * resolve the current patch and fall back to the bundled catalogs.
 */
export async function GET() {
  const [champions, shop] = await Promise.all([championCatalog(), buildCatalog()]);
  return Response.json(
    {
      championPatch: champions.patch,
      itemPatch: shop.patch,
      champions: champions.list.map(({ id, name, title, tags }) => ({ id, name, title, tags })),
      items: shop.items.map(({ id, name, gold, effect, shop: inShop, variant }) => ({
        id, name, gold, shop: inShop, variant, effect: effect.slice(0, 500),
      })),
    },
    { headers: { "Cache-Control": "public, s-maxage=300" } },
  );
}
