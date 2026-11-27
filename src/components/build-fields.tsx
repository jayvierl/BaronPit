"use client";

import Image from "next/image";
import { useId } from "react";
import type { PostDraft } from "@/lib/composer-draft";
import { publicPatch } from "@/lib/patch-notes";
import styles from "./composer.module.css";

export type BuildShop = { patch: string; current: boolean; choices: { id: number; name: string }[]; keystones: { id: number; name: string; tree: string }[] };

export function BuildFields({ draft, edit, champions, lockedChampion, patch, shop, shopError, retry }: {
  draft: PostDraft; edit: (changes: Partial<PostDraft>) => void; champions: string[]; lockedChampion?: string;
  patch: string; shop: BuildShop | null; shopError: boolean; retry: () => void;
}) {
  const listId = useId();
  const { champion, items, itemQuery, runes, offMeta, keystoneId } = draft;
  const query = itemQuery.trim().toLowerCase();
  const available = shop?.choices ?? [];
  const matches = query ? available.filter(({ name }) => name.toLowerCase().includes(query)).slice(0, 8) : [];
  const selected = items.map(id => [id, available.find(item => item.id === id)?.name] as const);
  const unavailableKeystone = keystoneId !== null && !shop?.keystones.some(rune => rune.id === keystoneId);

  return <div className={styles.buildFields}>
    <p className="meta">
      {shop ? `Current patch ${publicPatch(patch) ?? patch} · Summoner’s Rift shop` : !shopError && "Checking Riot’s current item and rune catalog…"}
    </p>
    <div className={styles.buildRow}>
      <label>Champion
        <input className="inline" maxLength={64} placeholder="Choose a champion" value={champion} readOnly={!!lockedChampion}
          list={lockedChampion ? undefined : listId} onChange={event => edit({ champion: event.target.value })}/>
        {!lockedChampion && <datalist id={listId}>{champions.map(id => <option key={id} value={id}/>)}</datalist>}
      </label>
      <label>Keystone <span className="meta">(optional)</span>
        <select className="inline" value={keystoneId ?? ""} disabled={!shop} onChange={event => edit({ keystoneId: Number(event.target.value) || null })}>
          <option value="">Choose a keystone</option>
          {unavailableKeystone && <option value={keystoneId}>Previously selected keystone is unavailable</option>}
          {shop?.keystones.map(rune => <option key={rune.id} value={rune.id}>{rune.name} · {rune.tree}</option>)}
        </select>
      </label>
    </div>
    <label>Search items
      <input className="inline" type="search" maxLength={120} placeholder="Search the item shop" value={itemQuery} disabled={!shop || items.length >= 6}
        onChange={event => edit({ itemQuery: event.target.value })}/>
    </label>
    {shopError && <p role="alert" className="meta">Riot’s current catalog is unavailable. Your choices and draft are kept. <button type="button" className="text-btn" onClick={retry}>Retry</button></p>}
    {!!shop && query && <div role="status" className="meta">{matches.length ? null : "No purchasable items match that name."}</div>}
    {matches.length > 0 && <ul className={styles.buildChoices} aria-label="Matching items">
      {matches.map(({ name, id }) => <li key={id}><button className="chip" type="button" disabled={items.length >= 6}
        onClick={() => edit({ items: [...items, id], itemQuery: "" })}>{name}{matches.some(other => other.id !== id && other.name === name) ? ` (${id})` : ""}</button></li>)}
    </ul>}
    <div className={styles.buildItems}>
      <p className="meta" aria-live="polite">{items.length} of 6 item slots used</p>
      {selected.length > 0 && <ol className={styles.buildChoices} aria-label="Selected items in build order">
        {selected.map(([id, name], index) => <li key={`${id}:${index}`}>
          <button type="button" className="chip" aria-label={`Remove ${name ?? `item ${id}`}, slot ${index + 1}`} onClick={() => edit({ items: items.filter((_, i) => i !== index) })}>
            {name && <Image src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`} alt="" width={22} height={22} unoptimized/>}
            <span>{name ?? `Item ${id}${shop ? " unavailable" : ""}`}</span><span aria-hidden="true">×</span>
          </button>
        </li>)}
      </ol>}
    </div>
    <label>Rune notes <span className="meta">(optional)</span>
      <input className="inline" maxLength={240} placeholder="Secondary tree or situational choices" value={runes} onChange={event => edit({ runes: event.target.value })}/>
    </label>
    <label className={styles.offMeta}><input type="checkbox" checked={offMeta} onChange={event => edit({ offMeta: event.target.checked })}/> Off-meta build</label>
  </div>;
}
