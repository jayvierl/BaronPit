import { publicPatch } from "@/lib/patch-notes";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildCatalog } from "@/lib/build-catalog";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  const catalog = await buildCatalog();
  const item = catalog.items.find((i) => i.id === Number(id));
  if (!item) notFound();
  return (
    <div>
      <Link href="/builds">Builds</Link>
      <h1 className="page-title">{item.name}</h1>
      <section className="card">
        <Image
          unoptimized
          width={56}
          height={56}
          src={`https://ddragon.leagueoflegends.com/cdn/${catalog.patch}/img/item/${id}.png`}
          alt=""
        />
        <p>
          <strong>{item.gold.toLocaleString("en-US")} gold</strong> · Patch {publicPatch(catalog.patch) ?? "unavailable"}
        </p>
        <p style={{ whiteSpace: "pre-line" }}>
          {item.effect || "Riot lists no effect text for this item on this patch."}
        </p>
        {item.shop ? (
          <Link href={`/builds/compare?item=${id}`}>Compare this item in a build</Link>
        ) : (
          <p className="meta">Outside the standard Summoner’s Rift shop.</p>
        )}
      </section>
    </div>
  );
}
