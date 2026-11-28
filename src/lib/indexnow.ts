import { buildCatalog, shopListed } from "./build-catalog";
import { championCatalog } from "./riot";

/**
 * IndexNow lets search engines learn about new or changed URLs immediately
 * instead of waiting for a crawl. The key below is public by design: it is
 * served from /6ff0db0963929d3b1fb60a296b4b316b.txt so engines can verify
 * that this site owns the submissions.
 */
export const INDEXNOW_KEY = "6ff0db0963929d3b1fb60a296b4b316b";
export const SITE_ORIGIN = "https://baronpit.com";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_PING = 10_000;

function indexNowEnabled() {
  return process.env.NODE_ENV === "production";
}

/**
 * Submit URLs to IndexNow. A no-op outside production, deduplicates and
 * caps the batch, and never throws: a failed ping must not break the
 * caller, so every error is swallowed.
 */
export async function pingIndexNow(urls: readonly string[]): Promise<void> {
  if (!indexNowEnabled()) return;
  try {
    const urlList = [...new Set(urls)].filter((url) => url.startsWith(`${SITE_ORIGIN}/`)).slice(0, MAX_URLS_PER_PING);
    if (!urlList.length) return;
    await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: "baronpit.com",
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // IndexNow is best-effort; crawlers still find everything via the sitemap.
  }
}

/**
 * URLs whose content is tied to the current Data Dragon patch: the catalog
 * indexes and one page per champion and shop item. Used by the patch-watch
 * cron when a new patch lands.
 */
export async function catalogPingUrls(): Promise<string[]> {
  if (!indexNowEnabled()) return [];
  try {
    const [catalog, builds] = await Promise.all([championCatalog(), buildCatalog()]);
    const urls = [
      `${SITE_ORIGIN}/`,
      `${SITE_ORIGIN}/champions`,
      `${SITE_ORIGIN}/items`,
      `${SITE_ORIGIN}/rooms`,
      `${SITE_ORIGIN}/rooms/patch-meta`,
    ];
    for (const champion of catalog.list) {
      urls.push(`${SITE_ORIGIN}/champions/${encodeURIComponent(champion.id)}`);
      urls.push(`${SITE_ORIGIN}/rooms/champ-${champion.id.toLowerCase()}`);
    }
    for (const item of builds.items) {
      if (shopListed(item)) urls.push(`${SITE_ORIGIN}/items/${item.id}`);
    }
    return urls;
  } catch {
    return [];
  }
}

/** Fire the catalog ping after a patch change; safe to await (never throws). */
export async function pingIndexNowForPatch(): Promise<void> {
  const urls = await catalogPingUrls();
  await pingIndexNow(urls);
}
