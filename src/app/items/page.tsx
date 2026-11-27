import Link from "next/link";
import { GameAssetIcon } from "@/components/game-asset-icon";
import { currentBuildCatalog } from "@/lib/build-catalog";
import { itemIconUrl, normalizeTagName } from "@/lib/game-tags";
import { itemDirectoryFilters, itemDirectoryHref } from "@/lib/item-navigation";
import { publicPatch } from "@/lib/patch-notes";
import { withSearchReturn } from "@/lib/search-scopes";
import styles from "./items.module.css";

const pageSize = 24;

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ catalog, current }, params] = await Promise.all([currentBuildCatalog(), searchParams]);
  const filters = itemDirectoryFilters(params);
  const query = normalizeTagName(filters.query);
  const items = catalog.items.filter(item => {
    if (!filters.allItems && !item.shop) return false;
    return !filters.query || String(item.id) === filters.query || (query.length > 0 && normalizeTagName(item.name).includes(query));
  }).sort((a, b) => a.name.localeCompare(b.name, "en") || a.id - b.id);
  const pages = Math.ceil(items.length / pageSize);
  const page = Math.min(filters.page, Math.max(1, pages));
  const start = (page - 1) * pageSize;
  const directory = itemDirectoryHref({ ...filters, page });

  return <div>
    <h1 className="page-title">Items</h1>
    <p className="meta">{current ? "Current patch" : "Last available Data Dragon catalog"} {publicPatch(catalog.patch) ?? catalog.patch}</p>
    <form key={directory} className={styles.filters} action="/items" method="get" role="search" aria-label="Filter items">
      <input className="inline" type="search" aria-label="Item name or ID" name="q" placeholder="Item name or ID" maxLength={80} defaultValue={filters.query}/>
      <select className="inline" name="scope" aria-label="Item catalog" defaultValue={filters.allItems ? "all" : "shop"}>
        <option value="shop">Summoner’s Rift shop</option>
        <option value="all">All game items</option>
      </select>
      <button className="btn secondary small" type="submit">Apply</button>
    </form>
    {items.length ? <>
      <p className="meta" role="status">Showing {start + 1}–{Math.min(start + pageSize, items.length)} of {items.length} items</p>
      <ul className={styles.grid} role="list">
        {items.slice(start, start + pageSize).map(item => <li key={item.id}>
          <Link href={withSearchReturn(`/items/${item.id}`, directory === "/items" ? undefined : directory)} prefetch={false}>
            <GameAssetIcon size={36} name={item.name} src={itemIconUrl(catalog.patch, item.id)}/>
            <span><strong>{item.name}</strong><small>{item.gold.toLocaleString("en-US")} gold · ID {item.id}</small></span>
          </Link>
        </li>)}
      </ul>
      {pages > 1 && <nav className={styles.pages} aria-label="Item pages">
        {page > 1 && <Link rel="prev" href={itemDirectoryHref({ ...filters, page: page - 1 })}>← Previous</Link>}
        <span>Page {page} of {pages}</span>
        {page < pages && <Link rel="next" href={itemDirectoryHref({ ...filters, page: page + 1 })}>Next →</Link>}
      </nav>}
    </> : <p role="status">No items match these filters. <Link href="/items">Clear filters</Link></p>}
  </div>;
}
