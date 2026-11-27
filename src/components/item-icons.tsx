import type { CardItem } from "@/lib/build-catalog";
import { GameAssetIcon } from "./game-asset-icon";
import styles from "./item-icons.module.css";

export function ItemIcons({
  ids,
  patch,
  details = [],
}: {
  ids: number[];
  patch: string;
  details?: CardItem[];
}) {
  const itemIds = ids.filter((id) => Number.isSafeInteger(id) && id > 0);
  if (itemIds.length === 0) return null;
  return (
    <div className={styles.items} role="group" aria-label="Items">
      {itemIds.map((id, index) => {
        const item = details.find((i) => i.id === id);
        if (!item)
          return (
            <span className="meta" key={index}>
              Unlisted item {id}
            </span>
          );
        return (
          <a
            key={index}
            href={`/items/${id}`}
            className={styles.item}
            aria-label={`${item.name}, ${item.gold} gold. View item details`}
          >
            <GameAssetIcon
              size={30} name={item.name}
              src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`}
            />
            <span className={styles.tip} aria-hidden="true">
              <strong>{item.name}</strong> · {item.gold} gold
              <br />
              {item.effect.split("\n\n").at(-1) || "View item details"}
            </span>
          </a>
        );
      })}
    </div>
  );
}
