import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { searchAll } from "@/lib/social";
import { currentPatch, PLATFORMS } from "@/lib/riot";
import { Avatar } from "@/components/ui";
import { LookupForm, PostCard } from "@/components/social-ui";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, getCurrentUser()]);
  const term = typeof sp.q === "string" ? sp.q.trim().slice(0,80) : "";
  const [results, patch] = await Promise.all([
    term ? searchAll(term, user).catch(() => null) : null, term ? currentPatch() : "",
  ]);
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 className="page-title">Search{term && <> — “{term}”</>}</h1>
      <form method="get" role="search" className="lookup-row">
        <input name="q" className="inline" aria-label="Search the community" placeholder="Find a person, room or hashtag" defaultValue={term} maxLength={80}/>
        <button className="btn small" type="submit">Search</button>
      </form>
      {term && !results && <p className="notice warn" role="status">Community search is temporarily unavailable. You can still look up a player below.</p>}
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
              {results.tagPosts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} />)}
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
