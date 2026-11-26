import Link from "next/link";
import { championList, currentPatch, championIconUrl } from "@/lib/riot";

export const dynamic = "force-dynamic";

export default async function ChampionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const patch = await currentPatch();
  const all = await championList();
  const query = sp.q?.toLowerCase();
  const list = query ? all.filter((c) => c.name.toLowerCase().includes(query)) : all;
  return (
    <div>
      <h1 className="page-title">Champions</h1>
      <p className="meta">Patch {patch} · {all.length} champions. Every champion has a room; builds live one click away.</p>
      <form method="get" style={{ margin: "12px 0 18px" }}>
        <input className="inline" name="q" placeholder="Filter champions…" defaultValue={sp.q ?? ""} style={{ width: 260 }} />
      </form>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {list.map((c) => (
          <div key={c.id} className="card" style={{ padding: 13 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <img className="champ-icon" src={championIconUrl(patch, c.id)} alt="" />
              <div>
                <strong style={{ fontSize: 15 }}>{c.name}</strong>
                <div className="meta" style={{ fontSize: 12 }}>{c.tags.join(" · ")}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 9, fontSize: 13, fontWeight: 700 }}>
              <Link href={`/rooms/champ-${c.id.toLowerCase()}`}>Room</Link>
              <Link href={`/builds?champ=${encodeURIComponent(c.id)}`}>Builds</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
