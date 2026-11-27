import Link from "next/link";
import { Composer } from "@/components/composer";
import { GuestPostDraft } from "@/components/guest-draft";
import { PostCard } from "@/components/post-card";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { buildCatalog } from "@/lib/build-catalog";
import { buildDraftScope, buildItemId, buildsHref } from "@/lib/build-sharing";
import { roomFeedHref } from "@/lib/room-feed";
import { getRoom } from "@/lib/rooms";
import { championList, currentPatch } from "@/lib/riot";
import { buildFeed } from "@/lib/social";
import styles from "./builds.module.css";

type Params = { champ?: string; item?: string; offmeta?: string; compose?: string; room?: string };

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
  const [builds, catalog, candidate] = await Promise.all([
    buildFeed(user, filters).catch(() => null),
    itemId ? buildCatalog(patch) : null,
    roomRequested && champion ? getRoom(`champ-${champion.id.toLowerCase()}`, user?.id).catch(() => null) : null,
  ]);
  const item = catalog?.items.find(entry => entry.id === itemId);
  const room = candidate?.championId === champion?.id ? candidate : null;
  const destination = buildsHref({ ...filters, compose: true, room: !!room });
  const returnHref = room ? roomFeedHref(room.slug, "builds") : item ? `/items/${item.id}` : buildsHref(filters);
  const scope = buildDraftScope(champion?.id, item?.shop ? item.id : undefined, room?.id, offMeta);
  const viewerIdentity = publicAvatarIdentity(user);
  const shareLabel = item?.shop && !champion ? `Share a build with ${item.name}` : "Share a build";

  return (
    <div>
      <header className={styles.header}>
        {item && !composing && <Link className={styles.inlineLink} href={`/items/${item.id}`} prefetch={false}>← Back to {item.name}</Link>}
        <h1 className="page-title">{champion ? `${champion.name} builds` : item ? `Builds with ${item.name}` : "Builds"}</h1>
        <p className="meta">Community build paths and the reasoning behind them.</p>
        <div className={styles.links}>
          {!composing && <Link className="btn" href={destination} prefetch={false}>{shareLabel}</Link>}
          <Link className="btn secondary" href={item?.shop ? `/builds/compare?item=${item.id}` : "/builds/compare"}>Compare build paths</Link>
        </div>
      </header>
      {composing && <section className={styles.compose} aria-labelledby="build-composer-title">
        <div className={styles.composeHeading}>
          <h2 id="build-composer-title">{shareLabel}</h2>
          <Link className={styles.inlineLink} href={returnHref} prefetch={false}>{room ? "Back to champion room" : item ? "Back to item" : "Close editor"}</Link>
        </div>
        {roomRequested && !room ? <p role="status">This champion room is unavailable. <Link className={styles.inlineLink} href={destination}>Share in community builds</Link>.</p>
          : itemId && !item?.shop ? <p role="status">This item is unavailable in the current Summoner’s Rift shop. <Link className={styles.inlineLink} href={buildsHref({ ...filters, item: undefined, compose: true })}>Start without this item</Link>.</p>
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
      <form method="get" className={styles.filters} key={buildsHref(filters)}>
        {itemId && <input type="hidden" name="item" value={itemId}/>}
        <input className="inline" name="champ" aria-label="Filter by champion" list="build-champs" placeholder="Filter by champion…" defaultValue={filteredChampion}/>
        <datalist id="build-champs">{champions.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</datalist>
        <label className={styles.filterCheck}><input type="checkbox" name="offmeta" value="1" defaultChecked={offMeta}/> Off-meta only</label>
        <button type="submit" className="btn small">Filter</button>
        {(filteredChampion || offMeta || itemId) && <Link href="/builds" className="btn small secondary">Clear</Link>}
      </form>
      {builds === null ? <p className="notice warn" role="status">Community builds are temporarily unavailable. Try again shortly.</p> : builds.length === 0
        ? <p className={styles.empty}>No builds match yet.</p>
        : builds.map(post => <PostCard key={post.id} post={post} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} viewerIdentity={viewerIdentity} fromBuild={returnHref}/>)}
    </div>
  );
}
