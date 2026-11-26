import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { feed } from "@/lib/social";
import { currentPatch, championList } from "@/lib/riot";
import { PostCard } from "@/components/social-ui";

export const dynamic = "force-dynamic";

export default async function BuildsPage({ searchParams }: { searchParams: Promise<{ champ?: string; offmeta?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser().catch(() => null);
  const patch = await currentPatch();
  const champions = await championList();
  // Pull recent build posts (feed is recency-based; filter here for the explorer).
  const rows = await q`SELECT id FROM wp_posts WHERE kind = 'build' AND status = 'visible' ORDER BY created_at DESC LIMIT 100`.catch(() => []);
  const ids = new Set(rows.map((r) => Number(r.id)));
  const all = await feed(user, "everyone", undefined, 100).catch(() => []);
  let builds = all.filter((p) => p.kind === "build" && ids.has(p.id));
  const champFilter = sp.champ?.toLowerCase();
  if (champFilter) builds = builds.filter((p) => String(p.data.champion ?? "").toLowerCase() === champFilter);
  if (sp.offmeta === "1") builds = builds.filter((p) => p.data.offMeta === true);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 className="page-title">Builds 🛠</h1>
      <p className="meta">
        Community builds stamped with the patch they were posted on, from players whose rank you can check.
        Off-meta builds are first-class here — that&apos;s half the fun of League.
      </p>
      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0" }}>
        <input className="inline" name="champ" list="build-champs" placeholder="Filter by champion…" defaultValue={sp.champ ?? ""} />
        <datalist id="build-champs">{champions.map((c) => <option key={c.id} value={c.id} />)}</datalist>
        <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" name="offmeta" value="1" defaultChecked={sp.offmeta === "1"} /> Off-meta only
        </label>
        <button type="submit" className="btn small">Filter</button>
        {(sp.champ || sp.offmeta) && <Link href="/builds" className="btn small secondary">Clear</Link>}
      </form>
      {builds.length === 0
        ? <div className="card empty">No builds match yet — post the first one from the composer on the <Link href="/">feed</Link>.</div>
        : builds.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} />)}
    </div>
  );
}
