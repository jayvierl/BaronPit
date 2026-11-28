import type { Metadata } from "next";
import Link from "next/link";
import { BuildsLink } from "@/components/builds-link";
import { Composer } from "@/components/composer";
import { GuestPostDraft } from "@/components/guest-draft";
import { PostCard } from "@/components/post-card";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { buildCatalog } from "@/lib/build-catalog";
import { buildDraftScope, buildItemId, buildsHref, readBuildBrowseReturn } from "@/lib/build-sharing";
import { roomFeedHref } from "@/lib/room-feed";
import { getRoom } from "@/lib/rooms";
import { championList, currentPatch } from "@/lib/riot";
import { readSearchReturn, withSearchReturn } from "@/lib/search-scopes";
import { buildFeed } from "@/lib/social";
import styles from "./builds.module.css";

type Params = { champ?: string; item?: string; offmeta?: string; compose?: string; room?: string; from?: string | string[] };

const BUILDS_TITLE = "League of Legends Builds — Community Builds & Counters";
const BUILDS_DESCRIPTION = "Browse and share League of Legends builds from the community: starting items, full paths and the reasoning behind them, for every champion.";
export const metadata: Metadata = {
  title: BUILDS_TITLE,
  description: BUILDS_DESCRIPTION,
  alternates: { canonical: "/builds" },
  openGraph: { title: BUILDS_TITLE, description: BUILDS_DESCRIPTION },
  twitter: { title: BUILDS_TITLE, description: BUILDS_DESCRIPTION },
};

export const dynamic = "force-dynamic";

export default async function BuildsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [params, user, patch, champions] = await Promise.all([searchParams, getCurrentUser(), currentPatch(), championList()]);
  const lookup = typeof params.champ === "string" ? params.champ.trim().slice(0, 64) : "";
  const champion = champions.find(entry => entry.id.toLowerCase() === lookup.toLowerCase() || entry.name.toLowerCase() === lookup.toLowerCase());
  const filteredChampion = champion?.id ?? lookup;
  const itemId = buildItemId(params.item);
  const offMeta = params.offmeta === "1";
  const composing = params.compose === "1";
  const roomRequested = composing && params.room === "1";
  const filters = { champion: filteredChampion || undefined, item: itemId, offMeta };
  const browseReturn = readBuildBrowseReturn(params.from);
  const [builds, catalog, candidate] = await Promise.all([
    buildFeed(user, filters).catch(() => null),
    itemId ? buildCatalog(patch) : null,
    roomRequested && champion ? getRoom(`champ-${champion.id.toLowerCase()}`, user?.id).catch(() => null) : null,
  ]);
  const item = catalog?.items.find(entry => entry.id === itemId);
  const room = candidate?.championId === champion?.id ? candidate : null;
  const viewOptions = { ...filters, from: browseReturn };
  const collectionHref = buildsHref(viewOptions);
  const destination = buildsHref({ ...viewOptions, compose: true, room: !!room });
  const itemHref = item ? withSearchReturn(`/items/${item.id}`, readSearchReturn(browseReturn)) : undefined;
  const returnHref = room ? withSearchReturn(roomFeedHref(room.slug, "builds"), browseReturn) : itemHref ?? collectionHref;
  const scope = buildDraftScope(champion?.id, item?.shop ? item.id : undefined, room?.id, offMeta);
  const viewerIdentity = publicAvatarIdentity(user);
  const shareLabel = item?.shop && !champion ? `Share a build with ${item.name}` : "Share a build";

  return (
    <div>
      <header className={styles.header}>
        {!composing && item && itemHref && <Link className={styles.inlineLink} href={itemHref} prefetch={false}>← Back to {item.name}</Link>}
        {!composing && !itemHref && browseReturn && <Link className={styles.inlineLink} href={browseReturn} prefetch={false}>
          {readSearchReturn(browseReturn) ? "← Back to search" : "← Back to champions"}
        </Link>}
        <h1 className="page-title">{champion ? `${champion.name} builds` : item ? `Builds with ${item.name}` : "Builds"}</h1>
        <p className="meta">Community build paths and the reasoning behind them.</p>
        <div className={styles.links}>
          {!composing && <BuildsLink className="btn" href={destination}>{shareLabel}</BuildsLink>}
          <BuildsLink className="btn secondary" href={item?.shop ? `/builds/compare?item=${item.id}` : "/builds/compare"}>Compare build paths</BuildsLink>
        </div>
      </header>
      {composing && <section className={styles.compose} aria-labelledby="build-composer-title">
        <div className={styles.composeHeading}>
          <h2 id="build-composer-title">{shareLabel}</h2>
          <Link className={styles.inlineLink} href={returnHref} prefetch={false}>{room ? "Back to champion room" : itemHref ? "Back to item" : "Close editor"}</Link>
        </div>
        {roomRequested && !room ? <p role="status">This champion room is unavailable. <Link className={styles.inlineLink} href={destination}>Share in community builds</Link>.</p>
          : itemId && !item?.shop ? <p role="status">This item is unavailable in the loaded Summoner’s Rift catalog. <Link className={styles.inlineLink} href={buildsHref({ ...viewOptions, item: undefined, compose: true, room: !!room })}>Start without this item</Link>.</p>
          : <>
            {room && <p className="meta">Posting in {room.name}</p>}
            {item?.shop && <p className="meta">Starts with {item.name} in the first slot.</p>}
            {user ? <Composer key={`${user.id}:${scope}`} viewerId={user.id} viewerIdentity={viewerIdentity} patch={patch}
              champions={champions.map(entry => entry.id)} roomId={room?.id}
              buildContext={{ scope, champion: champion?.id, item: item?.id, offMeta, returnHref, roomSlug: room?.slug }}/>
              : <>
                {champion && <p className="meta">Champion · {champion.name}</p>}
                <GuestPostDraft draftScope={scope} destination={destination} label="Build reasoning"/>
              </>}
          </>}
      </section>}
      {itemId && !item && !composing && <p role="status" className="meta">The selected item is unavailable in the catalog.</p>}
      <form method="get" className={styles.filters} key={collectionHref}>
        {browseReturn && <input type="hidden" name="from" value={browseReturn}/>}
        {itemId && <input type="hidden" name="item" value={itemId}/>}
        <input className="inline" name="champ" aria-label="Filter by champion" list="build-champs" placeholder="Filter by champion…" defaultValue={filteredChampion}/>
        <datalist id="build-champs">{champions.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</datalist>
        <label className={styles.filterCheck}><input type="checkbox" name="offmeta" value="1" defaultChecked={offMeta}/> Off-meta only</label>
        <button type="submit" className="btn small">Filter</button>
        {(filteredChampion || offMeta || itemId) && <Link href={buildsHref({ from: browseReturn })} className="btn small secondary">Clear</Link>}
      </form>
      {builds === null ? <p className="notice warn" role="status">Community builds are temporarily unavailable. Try again shortly.</p> : builds.length === 0
        ? <p className={styles.empty}>No builds match yet.</p>
        : builds.map(post => <PostCard key={post.id} post={post} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} viewerIdentity={viewerIdentity} fromBuild={collectionHref}/>)}
    </div>
  );
}
