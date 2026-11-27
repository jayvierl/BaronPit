import type { MetadataRoute } from "next";
import { buildCatalog } from "@/lib/build-catalog";
import { SITE_ORIGIN } from "@/lib/indexnow";
import { championCatalog } from "@/lib/riot";

// The five broad rooms seeded in src/lib/rooms.ts (BROAD_ROOMS). Champion
// rooms are derived from the catalog below, one per champion.
const BROAD_ROOM_SLUGS = ["general", "patch-meta", "off-meta-lab", "lfg-lobby", "new-players"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const urls: MetadataRoute.Sitemap = [
    { url: `${SITE_ORIGIN}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_ORIGIN}/player`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_ORIGIN}/champions`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_ORIGIN}/items`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_ORIGIN}/rooms`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_ORIGIN}/questions`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_ORIGIN}/pilot`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_ORIGIN}/safety`, changeFrequency: "monthly", priority: 0.4 },
  ];

  for (const slug of BROAD_ROOM_SLUGS) {
    urls.push({ url: `${SITE_ORIGIN}/rooms/${slug}`, lastModified: now, changeFrequency: "daily", priority: 0.6 });
  }

  const [catalog, builds] = await Promise.all([championCatalog(), buildCatalog()]);
  for (const champion of catalog.list) {
    urls.push({
      url: `${SITE_ORIGIN}/champions/${encodeURIComponent(champion.id)}`,
      changeFrequency: "monthly",
      priority: 0.7,
    });
    urls.push({
      url: `${SITE_ORIGIN}/rooms/champ-${champion.id.toLowerCase()}`,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }
  for (const item of builds.items) {
    if (!item.shop) continue;
    urls.push({ url: `${SITE_ORIGIN}/items/${item.id}`, changeFrequency: "monthly", priority: 0.5 });
  }
  return urls;
}
