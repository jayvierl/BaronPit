import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { searchAll } from "@/lib/social";
import { currentPatch, PLATFORMS } from "@/lib/riot";
import { playerStatsHref } from "@/lib/platforms";
import { Avatar } from "@/components/ui";
import { LookupForm, PostCard } from "@/components/social-ui";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, getCurrentUser()]);
  const viewerIdentity = publicAvatarIdentity(user);
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
        <p className="meta">Enter a Riot ID and choose a server to see recent games.</p>
        <LookupForm key={term} initialRiotId={term.startsWith("#") ? "" : term} platforms={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} />
      </div>

      {results && (
        <>
          {results.players.length > 0 && (
            <>
              <h2 className="section">Riot players</h2>
              {results.players.map((p) => (
                <Link key={p.puuid} className={`card ${styles.result}`} href={playerStatsHref(p.platform, p.riotId)} prefetch={false}>
                  <span className={styles.identity}><strong>{p.riotId}</strong><small>{PLATFORMS.find(region => region.id === p.platform)?.label ?? p.platform}</small></span>
                  <span className="chip">{p.rank}</span>
                </Link>
              ))}
            </>
          )}
          {results.users.length > 0 && (
            <>
              <h2 className="section">Community profiles</h2>
              {results.users.map((u) => (
                <Link key={u.id} href={`/u/${u.id}`} className={`card ${styles.result}`}>
                  <Avatar name={u.name} hue={u.hue} avatar={u.avatar} size={36} />
                  <strong className={styles.identity}>{u.name}</strong>
                </Link>
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
              {results.tagPosts.map((p) => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} viewerIdentity={viewerIdentity} />)}
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
