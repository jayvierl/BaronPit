import Form from "next/form";
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
  const empty = results && !results.users.length && !results.players.length && !results.rooms.length && !results.tagPosts.length;
  return <div className={styles.search}>
    <h1 className="page-title">Search</h1>
    <Form key={term} action="/search" prefetch={false} role="search" className={styles.form}>
      <input type="search" name="q" enterKeyHint="search" aria-label="Search the community" placeholder="People, rooms or #tags" defaultValue={term} maxLength={80}/>
      <button className="btn small" type="submit">Search</button>
    </Form>
    {!term && <nav className={styles.places} aria-label="Explore the community">
      <Link href="/lfg">Find a duo <span aria-hidden="true">→</span></Link>
      <Link href="/rooms">Browse rooms <span aria-hidden="true">→</span></Link>
      <Link href="/questions">Match questions <span aria-hidden="true">→</span></Link>
    </nav>}
    {term && !results && <p className="notice warn" role="status">Community search is temporarily unavailable. You can still look up a Riot ID below.</p>}
    {empty && <div className={styles.empty} role="status"><strong>No matches for “{term}”</strong><p>Try another name or <Link href="/rooms">browse rooms</Link>.</p></div>}
    {results && <>
      {results.users.length > 0 && <section>
        <h2 className="section">Community profiles</h2>
        {results.users.map(u => <Link key={u.id} href={`/u/${u.id}`} className={`card ${styles.result}`}>
          <Avatar name={u.name} hue={u.hue} avatar={u.avatar} size={36}/><strong className={styles.identity}>{u.name}</strong>
        </Link>)}
      </section>}
      {results.rooms.length > 0 && <section>
        <h2 className="section">Rooms</h2>
        {results.rooms.map(r => <Link key={r.id} href={`/rooms/${r.slug}`} className={`card ${styles.result}`}>
          <strong className={styles.identity}>{r.name}</strong><span className="meta">{r.members} {r.members === 1 ? "member" : "members"}</span>
        </Link>)}
      </section>}
      {results.players.length > 0 && <section>
        <h2 className="section">Riot players</h2>
        {results.players.map(p => <Link key={p.puuid} className={`card ${styles.result}`} href={playerStatsHref(p.platform, p.riotId)} prefetch={false}>
          <span className={styles.identity}><strong>{p.riotId}</strong><small>{PLATFORMS.find(region => region.id === p.platform)?.label ?? p.platform}</small></span>
          <span className="chip">{p.rank}</span>
        </Link>)}
      </section>}
      {results.tagPosts.length > 0 && <section>
        <h2 className="section">Posts with this tag</h2>
        {results.tagPosts.map(p => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} viewerIdentity={viewerIdentity}/>)}
      </section>}
    </>}
    <details key={"lookup:" + term} className={styles.lookup} open={Boolean(term && (!results || (!term.startsWith("#") && term.includes("#"))))}>
      <summary>Look up a Riot ID</summary>
      <LookupForm initialRiotId={term.startsWith("#") ? "" : term} platforms={PLATFORMS.map(p => ({id:p.id,label:p.label}))}/>
    </details>
  </div>;
}
