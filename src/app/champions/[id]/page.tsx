import Link from "next/link";
import { notFound } from "next/navigation";
import { ChampionPortrait } from "@/components/champion-portrait";
import { championCatalog } from "@/lib/riot";
import { publicPatch } from "@/lib/patch-notes";
import { catalogText } from "@/lib/catalog-text";
import { buildsHref } from "@/lib/build-sharing";
import { visibleChampionRoomSlugs } from "@/lib/rooms";

async function abilities(patch: string, id: string) {
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion/${encodeURIComponent(id)}.json`, {
      next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const champ = payload.data?.[id];
    if (payload.version !== patch || champ?.id !== id || !Array.isArray(champ.spells) || champ.spells.length !== 4) return null;
    const kit = [champ.passive, ...champ.spells].map((skill, i) => ({
      key: ["Passive", "Q", "W", "E", "R"][i], name: catalogText(skill?.name), description: catalogText(skill?.description),
    }));
    return kit.every(skill => skill.name && skill.description) ? kit : null;
  } catch {
    return null;
  }
}

export default async function ChampionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, catalog] = await Promise.all([params, championCatalog()]);
  const champ = catalog.list.find(entry => entry.id.toLowerCase() === id.toLowerCase());
  if (!champ) notFound();
  const [kit, rooms] = await Promise.all([
    abilities(catalog.patch, champ.id),
    visibleChampionRoomSlugs([champ.id]).catch(() => []),
  ]);
  return <article>
    <Link href="/champions">← Champions</Link>
    <header className="card">
      <ChampionPortrait id={champ.id} patch={catalog.patch} size={56}/>
      <h1 className="page-title">{champ.name}</h1>
      <p>{champ.title} · {champ.tags.join(" · ")}</p>
      <small className="meta">Riot Data Dragon · Patch {publicPatch(catalog.patch) ?? catalog.patch}</small>
      {rooms.length > 0 && <p><Link href={`/rooms/${rooms[0]}`} prefetch={false}>Visit the {champ.name} room</Link></p>}
    </header>
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
