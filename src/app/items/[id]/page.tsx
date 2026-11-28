import { publicPatch } from "@/lib/patch-notes";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameAssetIcon } from "@/components/game-asset-icon";
import { BuildsLink } from "@/components/builds-link";
import { buildCatalog, shopListed } from "@/lib/build-catalog";
import { buildItemId, buildsHref } from "@/lib/build-sharing";
import { readSearchReturn } from "@/lib/search-scopes";
import { readItemDirectoryReturn } from "@/lib/item-navigation";
import styles from "@/app/builds/builds.module.css";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const itemId = buildItemId(id);
  if (!itemId) return {};
  const catalog = await buildCatalog();
  const item = catalog.items.find((i) => i.id === itemId);
  if (!item) return {};
  const patch = publicPatch(catalog.patch);
  const effect = item.effect.replace(/\s+/g, " ").trim().slice(0, 150);
  const title = `${item.name} — ${item.gold.toLocaleString("en-US")} Gold, Effects & Builds`;
  const description = `${item.name} costs ${item.gold.toLocaleString("en-US")} gold${patch ? ` on patch ${patch}` : ""}. ` +
    `${effect ? `${effect} ` : ""}See community builds with ${item.name} on Baron Pit.`;
  return {
    title,
    description,
    alternates: { canonical: `/items/${item.id}` },
    openGraph: { title, description },
    twitter: { title, description },
  };
}

export default async function ItemPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const itemId = buildItemId(id);
  if (!itemId) notFound();
  const searchReturn = readSearchReturn(from);
  const directory = readItemDirectoryReturn(from) ?? "/items";
  const catalog = await buildCatalog();
  const item = catalog.items.find((i) => i.id === itemId);
  if (!item) notFound();
  return (
    <div>
      <nav aria-label="Item navigation" className={styles.links}>
        {searchReturn && <Link className={styles.inlineLink} href={searchReturn}>← Back to search</Link>}
        <Link className={styles.inlineLink} href={directory}>{searchReturn ? "Browse items" : "← Back to items"}</Link>
      </nav>
      <h1 className="page-title">{item.name}</h1>
      <section className="card">
        <GameAssetIcon size={56} name={item.name}
          src={`https://ddragon.leagueoflegends.com/cdn/${catalog.patch}/img/item/${item.id}.png`}
        />
        <p>
          <strong>{item.gold.toLocaleString("en-US")} gold</strong> · Patch {publicPatch(catalog.patch) ?? "unavailable"}
        </p>
        <p style={{ whiteSpace: "pre-line" }}>
          {item.effect || "Riot lists no effect text for this item on this patch."}
        </p>
        {!shopListed(item) && <p className="meta">Outside the standard Summoner’s Rift shop.</p>}
      </section>
      <div className={styles.links}>
        {item.shop && <BuildsLink className="btn" href={buildsHref({ item: item.id, compose: true, from: searchReturn })}>Share a build with {item.name}</BuildsLink>}
        <BuildsLink className="btn secondary" href={buildsHref({ item: item.id, from: searchReturn })}>See builds with this item</BuildsLink>
        {item.shop && <BuildsLink className={styles.inlineLink} href={`/builds/compare?item=${item.id}`}>Compare this item in a build</BuildsLink>}
      </div>
    </div>
  );
}
