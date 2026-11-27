import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { searchAll } from "@/lib/social";
import { searchGameData } from "@/lib/game-search";
import { SearchGameResults } from "@/components/search-game-results";
import { currentPatch } from "@/lib/riot";
import { isPlatform, playerStatsHref, splitRiotId, PLATFORMS } from "@/lib/platforms";
import { isExactRiotId, searchHref, searchScope, searchScopes, withSearchReturn } from "@/lib/search-scopes";
import { RankBadge } from "@/components/rank-badge";
import { Avatar } from "@/components/ui";
import { LookupForm, PostCard } from "@/components/social-ui";
import { WardEmptyState } from "@/components/ward-mascot";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const placeholders = {
  all: "Players, champions, items or posts", league: "Champion or item name", builds: "Champion, build rationale or #tag", people: "Community name", rooms: "Room or champion name",
  posts: "Words or #tags", players: "Player name or GameName#TAG",
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const term = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const scope = searchScope(params.scope);
  const playersOnly = scope === "players";
  const region = typeof params.region === "string" && isPlatform(params.region) ? params.region : undefined;
  const searchReturn = searchHref(scope, term, region, true);
  const exactId = isExactRiotId(term);
  const directLookup = exactId && params.results !== "1";
  if (directLookup && region && (scope === "all" || playersOnly)) {
    const { gameName, tagLine } = splitRiotId(term, region);
    redirect(withSearchReturn(playerStatsHref(region, gameName + "#" + tagLine), searchReturn));
  }
  const user = await getCurrentUser();
  const viewerIdentity = publicAvatarIdentity(user);
  const searched = term.length >= 2 || (term.length === 1 && (scope === "rooms" || scope === "all" || scope === "league"));
  const wantsSocial = searched && scope !== "league";
  const wantsCatalog = searched && (scope === "all" || scope === "league") && !term.includes("#");
  const [results, gameData, patch] = await Promise.all([
    wantsSocial ? searchAll(term, user, scope, region).catch(() => {
      console.error("Community search failed", { scope });
      return null;
    }) : null,
    wantsCatalog ? searchGameData(term, scope === "league" ? 20 : 3).catch(() => null) : null,
    wantsSocial && (scope === "all" || scope === "posts" || scope === "builds") ? currentPatch() : "",
  ]);
  // An unknown tag is not a platform. Only open an unambiguous cached match automatically.
  if (directLookup && scope === "all" && !region && results) {
    const { gameName, tagLine } = splitRiotId(term, "na1");
    const normalized = (gameName + "#" + tagLine).toLowerCase();
    const candidates = results.players.filter(p => p.riotId.toLowerCase() === normalized);
    if (candidates.length === 1) redirect(withSearchReturn(playerStatsHref(candidates[0].platform, candidates[0].riotId), searchReturn));
  }
  const noGameHits = !gameData?.champions.length && !gameData?.items.length;
  const noCommunityHits = !results?.users.length && !results?.players.length && !results?.rooms.length && !results?.posts.length;
  const empty = searched && (!wantsSocial || results) && (!wantsCatalog || gameData) && noGameHits && noCommunityHits;
  const listedHubs = new Set(gameData?.champions.filter(c => c.hasRoom).map(c => c.id));
  const roomResults = results?.rooms.filter(r => !r.championId || !listedHubs.has(r.championId)) ?? [];
  return <div className={styles.search}>
    <h1 className="page-title">Search</h1>
    <Form key={JSON.stringify([scope, term, region])} action="/search" prefetch={false} role="search">
      {scope !== "all" && <input type="hidden" name="scope" value={scope}/>}
      {!playersOnly && region && <input type="hidden" name="region" value={region}/>}
      <div className={styles.form}>
        <input type="search" name="q" enterKeyHint="search" aria-label={playersOnly ? "Player name or Riot ID" : "Search the community"}
          placeholder={placeholders[scope]} defaultValue={term} maxLength={80}/>
        {playersOnly && <select name="region" aria-label="League region" defaultValue={region ?? ""}>
          <option value="">All regions</option>
          {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>}
        <button className="btn small" type="submit">Search</button>
      </div>
    </Form>
    <nav className={styles.scopes} aria-label="Search categories">
      {searchScopes.map(item => <Link key={item.id} href={searchHref(item.id, term, region, true)} scroll={false}
        prefetch={false} aria-current={scope === item.id ? "page" : undefined}>{item.label}</Link>)}
    </nav>
    {playersOnly && <p className={styles.hint}>Search by name, or choose a region and enter a full Riot ID to open their League stats.</p>}
    {!term && (scope === "all" || scope === "league" || scope === "builds") && <nav className={styles.places} aria-label="Explore the community">
      <Link href="/champions">Champion hubs <span aria-hidden="true">→</span></Link>
      <Link href="/builds">Community builds <span aria-hidden="true">→</span></Link>
      <Link href="/lfg">Find a duo <span aria-hidden="true">→</span></Link>
      <Link href="/rooms">Browse rooms <span aria-hidden="true">→</span></Link>
      <Link href="/questions">Matchup Notebook <span aria-hidden="true">→</span></Link>
    </nav>}
    {searched && (scope === "all" || scope === "posts") && !term.includes("#") && (
      <p className={styles.hint}><Link className={styles.notebook} href={`/questions?${new URLSearchParams({ mode: "answered", q: term })}`}>
        Search Matchup Notebook <span aria-hidden="true">→</span>
      </Link></p>
    )}
    {term && !searched && <p role="status" className={styles.hint}>Enter at least two characters.</p>}
    {wantsCatalog && !gameData && <p role="status" className="notice warn">The game catalog is temporarily unavailable.</p>}
    {wantsSocial && !results && <p className="notice warn" role="status">Search is temporarily unavailable. <Link href={withSearchReturn("/player", searchReturn)}>Look up a Riot ID</Link>.</p>}
    {empty && <WardEmptyState text={`No matches for “${term}”`} status action={scope === "all"
      ? <Link href="/rooms">Browse rooms</Link>
      : playersOnly ? <Link href={withSearchReturn("/player", searchReturn)}>Look up a Riot ID</Link>
      : <Link href={searchHref("all", term, region, true)}>Search all categories</Link>}/>}
    {gameData && <SearchGameResults result={gameData} from={searchReturn}/>}
    {results && <>
      {results.users.length > 0 && <section>
        <h2 className="section">Community profiles</h2>
        {results.users.map(u => <Link key={u.id} href={withSearchReturn(`/u/${u.id}`, searchReturn)} className={styles.result}>
          <Avatar name={u.name} hue={u.hue} avatar={u.avatar} size={36}/><strong className={styles.identity}>{u.name}</strong>
        </Link>)}
      </section>}
      {roomResults.length > 0 && <section>
        <h2 className="section">Rooms</h2>
        {roomResults.map(r => <Link key={r.id} href={withSearchReturn(`/rooms/${r.slug}`, searchReturn)} className={styles.result}>
          <strong className={styles.identity}>{r.name}</strong><span className="meta">{r.members} {r.members === 1 ? "member" : "members"}</span>
        </Link>)}
      </section>}
      {results.players.length > 0 && <section>
        <h2 className="section">Riot players</h2>
        {results.players.map(p => <Link key={p.platform + "/" + p.riotId} className={styles.result} href={withSearchReturn(playerStatsHref(p.platform, p.riotId), searchReturn)} prefetch={false}>
          <span className={styles.identity}><strong>{p.riotId}</strong><small>{PLATFORMS.find(region => region.id === p.platform)?.label ?? p.platform}</small></span>
          <RankBadge tier={p.tier}>{p.rank}</RankBadge>
        </Link>)}
      </section>}
      {results.posts.length > 0 && <section>
        <h2 className="section">{scope === "builds" ? "Community builds" : term.startsWith("#") ? "Posts with this tag" : "Posts"}</h2>
        {results.posts.map(p => <PostCard key={p.id} post={p} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} viewerIdentity={viewerIdentity} fromSearch={searchReturn}/>)}
      </section>}
    </>}
    {scope === "all" && <details key={searchReturn} className={styles.lookup} open={Boolean(term && (!results || (!term.startsWith("#") && term.includes("#"))))}>
      <summary>Look up a Riot ID</summary>
      <LookupForm initialRiotId={term.startsWith("#") ? "" : term} defaultPlatform={region} searchReturn={searchReturn}
        platforms={PLATFORMS.map(p => ({id:p.id,label:p.label}))}/>
    </details>}
  </div>;
}
