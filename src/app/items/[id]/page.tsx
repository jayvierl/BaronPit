import { publicPatch } from "@/lib/patch-notes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameAssetIcon } from "@/components/game-asset-icon";
import { buildCatalog } from "@/lib/build-catalog";
import { buildItemId, buildsHref } from "@/lib/build-sharing";
import { readSearchReturn } from "@/lib/search-scopes";
import styles from "@/app/builds/builds.module.css";

export default async function ItemPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const itemId = buildItemId(id);
  if (!itemId) notFound();
  const searchReturn = readSearchReturn(from);
  const catalog = await buildCatalog();
  const item = catalog.items.find((i) => i.id === itemId);
  if (!item) notFound();
  return (
    <div>
      <Link className={styles.inlineLink} href={searchReturn ?? "/builds"}>{searchReturn ? "← Back to search" : "← Back to builds"}</Link>
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
        {!item.shop && <p className="meta">Outside the standard Summoner’s Rift shop.</p>}
      </section>
      <div className={styles.links}>
        {item.shop && <Link className="btn" href={buildsHref({ item: item.id, compose: true })}>Share a build with {item.name}</Link>}
        <Link className="btn secondary" href={buildsHref({ item: item.id })}>See builds with this item</Link>
        {item.shop && <Link className={styles.inlineLink} href={`/builds/compare?item=${id}`}>Compare this item in a build</Link>}
      </div>
    </div>
  );
}
