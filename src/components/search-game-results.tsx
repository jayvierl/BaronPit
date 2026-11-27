import Link from "next/link";
import { ChampionPortrait } from "./champion-portrait";
import { GameAssetIcon } from "./game-asset-icon";
import { publicPatch } from "@/lib/patch-notes";
import { withSearchReturn } from "@/lib/search-scopes";
import type { searchGameData } from "@/lib/game-search";
import styles from "@/app/search/search.module.css";

export function SearchGameResults({ result, from }: { result: Awaited<ReturnType<typeof searchGameData>>; from: string }) {
  return <>
    {result.champions.length > 0 && <section aria-labelledby="found-champions">
      <h2 id="found-champions" className="section">Champions</h2>
      {result.champions.map(champion => {
        const href = champion.hasRoom ? "/rooms/champ-" + champion.id.toLowerCase() : "/champions?" + new URLSearchParams({ q: champion.name });
        return <Link key={champion.id} className={styles.result} href={withSearchReturn(href, from)} prefetch={false}>
          <ChampionPortrait compact id={champion.id} patch={result.championPatch} size={38}/>
          <span className={styles.identity}><strong>{champion.name}</strong><small>{champion.tags.join(" · ")}</small></span>
          <span className={styles.kind}>{champion.hasRoom ? "Champion hub" : "Catalog"}</span>
        </Link>;
      })}
    </section>}
    {result.items.length > 0 && <section aria-labelledby="found-items">
      <h2 id="found-items" className="section">Items <span className={styles.caption}>Patch {publicPatch(result.itemPatch) ?? result.itemPatch}</span></h2>
      {result.items.map(item => <Link key={item.id} className={styles.result} href={withSearchReturn("/items/" + item.id, from)} prefetch={false}>
        <GameAssetIcon size={36} name={item.name} src={`https://ddragon.leagueoflegends.com/cdn/${result.itemPatch}/img/item/${item.id}.png`}/>
        <span className={styles.identity}><strong>{item.name}</strong><small>{item.gold.toLocaleString("en-US")} gold</small></span>
      </Link>)}
    </section>}
  </>;
}
