import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { searchAll } from "@/lib/social";
import { currentPatch, PLATFORMS } from "@/lib/riot";
import { Avatar } from "@/components/ui";
import { LookupForm, PostCard } from "@/components/social-ui";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();
  const user = await getCurrentUser().catch(() => null);
  const patch = await currentPatch();
  const results = term ? await searchAll(term, user).catch(() => null) : null;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 className="page-title">Search{term && <> — “{term}”</>}</h1>
      <div className="card">
        <strong>Looking for a player?</strong>
        <p className="meta">Search by exact Riot ID for full recent-form stats:</p>
        <LookupForm platforms={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} />
      </div>

      {results && (
        <>
          {results.players.length > 0 && (
            <>
              <h2 className="section">Players</h2>
              {results.players.map((p) => (
                <div key={p.puuid} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Link href={`/player?platform=${p.platform}&riotId=${encodeURIComponent(p.riotId)}`} style={{ fontWeight: 800, color: "var(--ink)" }}>{p.riotId}</Link>
                  <span className="chip">{p.rank}</span>
                </div>
              ))}
            </>
          )}
          {results.users.length > 0 && (
            <>
              <h2 className="section">People</h2>
              {results.users.map((u) => (
                <div key={u.id} className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Avatar name={u.name} hue={u.hue} size={36} />
                  <Link href={`/u/${u.id}`} style={{ fontWeight: 800, color: "var(--ink)" }}>{u.name}</Link>
                </div>
              ))}
            </>
          )}
          {results.rooms.length > 0 && (
            <>
              <h2 className="section">Rooms</h2>
              {results.rooms.map((r) => (
                <div key={r.id} className="card">
                  <Link href={`/rooms/${r.slug}`} style={{ fontWeight: 800, color: "var(--ink)" }}>{r.name}</Link>
                  <span className="meta"> · {r.members} members</span>
                </div>
              ))}
            </>
          )}
          {results.tagPosts.length > 0 && (
            <>
              <h2 className="section">Posts with this tag</h2>
              {results.tagPosts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} />)}
            </>
          )}
          {results.players.length === 0 && results.users.length === 0 && results.rooms.length === 0 && results.tagPosts.length === 0 && (
            <div className="card empty" style={{ marginTop: 16 }}>Nothing found for “{term}” yet.</div>
          )}
        </>
      )}
    </div>
  );
}
