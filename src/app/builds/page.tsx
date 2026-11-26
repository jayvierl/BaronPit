import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { buildFeed } from "@/lib/social";
import { currentPatch, championList } from "@/lib/riot";
import { PostCard } from "@/components/social-ui";

export const dynamic = "force-dynamic";

export default async function BuildsPage({ searchParams }: { searchParams: Promise<{ champ?: string; offmeta?: string }> }) {
  const [{ champ, offmeta }, user, patch, champions] = await Promise.all([
    searchParams, getCurrentUser(), currentPatch(), championList(),
  ]);
  const sp = { champ: typeof champ === "string" ? champ.slice(0,64) : "", offmeta: offmeta === "1" ? "1" : "" };
  const builds = await buildFeed(user, { champion: sp.champ || undefined, offMeta: sp.offmeta === "1" }).catch(() => null);
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 className="page-title">Builds 🛠</h1>
      <p className="meta">
        Explore community builds by champion and patch, including off-meta picks.
      </p>
      <Link className="btn secondary" href="/builds/compare">Compare build paths</Link>
      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0" }}>
        <input className="inline" name="champ" aria-label="Filter by champion" list="build-champs" placeholder="Filter by champion…" defaultValue={sp.champ ?? ""} />
        <datalist id="build-champs">{champions.map((c) => <option key={c.id} value={c.id} />)}</datalist>
        <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" name="offmeta" value="1" defaultChecked={sp.offmeta === "1"} /> Off-meta only
        </label>
        <button type="submit" className="btn small">Filter</button>
        {(sp.champ || sp.offmeta) && <Link href="/builds" className="btn small secondary">Clear</Link>}
      </form>
      {builds === null ? <p className="notice warn" role="status">Community builds are temporarily unavailable. Please try again shortly.</p> : builds.length === 0
        ? <div className="card empty">No builds match yet — post the first one from the composer on the <Link href="/">feed</Link>.</div>
        : builds.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} />)}
    </div>
  );
}
