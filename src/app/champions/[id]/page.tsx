import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChampionPortrait } from "@/components/champion-portrait";
import { championCatalog } from "@/lib/riot";
import { publicPatch } from "@/lib/patch-notes";
import { catalogText } from "@/lib/catalog-text";
import { buildsHref } from "@/lib/build-sharing";
import { visibleChampionRoomSlugs } from "@/lib/rooms";

async function championDetails(patch: string, id: string) {
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion/${encodeURIComponent(id)}.json`, {
      next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const champ = payload.data?.[id];
    if (payload.version !== patch || champ?.id !== id) return null;
    const blurb = catalogText(champ.blurb) || null;
    let kit = null;
    if (Array.isArray(champ.spells) && champ.spells.length === 4) {
      const parsed = [champ.passive, ...champ.spells].map((skill, i) => ({
        key: ["Passive", "Q", "W", "E", "R"][i], name: catalogText(skill?.name), description: catalogText(skill?.description),
      }));
      kit = parsed.every(skill => skill.name && skill.description) ? parsed : null;
    }
    return { kit, blurb };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const catalog = await championCatalog();
  const champ = catalog.list.find(entry => entry.id.toLowerCase() === id.toLowerCase());
  if (!champ) return {};
  const patch = publicPatch(catalog.patch);
  const title = `${champ.name}, ${champ.title} — Abilities, Builds & Community`;
  const description = `${champ.name} (${champ.title}) is a ${champ.tags.join(" / ")} champion in League of Legends. ` +
    `Full ability details${patch ? ` for patch ${patch}` : ""}, community builds and the ${champ.name} mains room on Baron Pit.`;
  return {
    title,
    description,
    alternates: { canonical: `/champions/${champ.id}` },
    openGraph: { title, description },
    twitter: { title, description },
  };
}

export default async function ChampionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, catalog] = await Promise.all([params, championCatalog()]);
  const champ = catalog.list.find(entry => entry.id.toLowerCase() === id.toLowerCase());
  if (!champ) notFound();
  const [details, rooms] = await Promise.all([
    championDetails(catalog.patch, champ.id),
    visibleChampionRoomSlugs([champ.id]).catch(() => []),
  ]);
  const kit = details?.kit ?? null;
  const pageUrl = `https://baronpit.com/champions/${champ.id}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: `${champ.name}, ${champ.title} — Abilities, Builds & Community`,
        description: `${champ.name} (${champ.title}) is a ${champ.tags.join(" / ")} champion in League of Legends. Ability details, community builds and discussion on Baron Pit.`,
        isPartOf: { "@id": "https://baronpit.com/#website" },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://baronpit.com/" },
          { "@type": "ListItem", position: 2, name: "Champions", item: "https://baronpit.com/champions" },
          { "@type": "ListItem", position: 3, name: champ.name, item: pageUrl },
        ],
      },
    ],
  };
  return <article>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <Link href="/champions">← Champions</Link>
    <header className="card">
      <ChampionPortrait id={champ.id} patch={catalog.patch} size={56}/>
      <h1 className="page-title">{champ.name}</h1>
      <p>{champ.title} · {champ.tags.join(" · ")}</p>
      <small className="meta">Riot Data Dragon · Patch {publicPatch(catalog.patch) ?? catalog.patch}</small>
      {rooms.length > 0 && <p><Link href={`/rooms/${rooms[0]}`} prefetch={false}>Visit the {champ.name} room</Link></p>}
    </header>
    <section className="card">
      <h2>About {champ.name}</h2>
      {details?.blurb && <p>{details.blurb}</p>}
      <p>
        {champ.name} is a {champ.tags.join(" / ")} champion in League of Legends. Below is the full ability kit
        for patch {publicPatch(catalog.patch) ?? catalog.patch}. You can also browse{" "}
        <Link href={buildsHref({ champion: champ.id })}>community builds for {champ.name}</Link>
        {rooms.length > 0 && <>, talk with other {champ.name} players in{" "}
          <Link href={`/rooms/${rooms[0]}`} prefetch={false}>the {champ.name} room</Link></>}
        , or <Link href="/player" prefetch={false}>look up a player&apos;s stats</Link> to see how they perform on {champ.name}.
      </p>
    </section>
    <section className="card">
      <h2>Abilities</h2>
      {kit ? <dl>{kit.map(skill => <div key={skill.key}>
        <dt><strong>{skill.key} · {skill.name}</strong></dt>
        <dd style={{ margin: ".25rem 0 1rem" }}>{skill.description}</dd>
      </div>)}</dl> : <p className="meta">Ability details are temporarily unavailable for this patch.</p>}
    </section>
    <Link className="btn secondary" href={buildsHref({ champion: champ.id })}>See builds for {champ.name}</Link>
  </article>;
}
