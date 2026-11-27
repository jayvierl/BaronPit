"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import {
  FALLBACK_PATCH,
  championIconUrl,
  findTagChampion,
  findTagItem,
  itemIconUrl,
  parseBodySegments,
  type TagRef,
} from "@/lib/game-tags";
import { useTagCatalog } from "@/lib/game-tags-client";
import styles from "./game-tag.module.css";

/**
 * One champion/item tag inside a post body: icon + colored name, with a
 * detail card on hover or focus and a link to its catalog entry. The token carries the display name,
 * so the chip is complete before the catalog arrives; the catalog only
 * enriches the card (and corrects the name to the catalog's own).
 */
export function GameTagChip({ tag }: { tag: TagRef }) {
  const catalog = useTagCatalog();
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const cardId = useId();
  const open = hover || focused;

  const champion = tag.kind === "champion" && catalog ? findTagChampion(catalog, tag.id) : undefined;
  const item = tag.kind === "item" && catalog ? findTagItem(catalog, tag.id) : undefined;
  const name = champion?.name ?? item?.name ?? tag.name;
  const patch = tag.kind === "champion" ? (catalog?.championPatch ?? FALLBACK_PATCH) : (catalog?.itemPatch ?? FALLBACK_PATCH);
  const icon = tag.kind === "champion" ? championIconUrl(patch, tag.id) : itemIconUrl(patch, tag.id);
  const kindLabel = tag.kind === "champion" ? "Champion" : "Item";

  function enter() {
    window.clearTimeout(closeTimer.current);
    setHover(true);
  }
  function leave() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHover(false), 180);
  }

  return (
    <span className={styles.wrap} onMouseEnter={enter} onMouseLeave={leave}>
      <Link
        href={tag.kind === "item" ? `/items/${encodeURIComponent(tag.id)}` : `/champions/${encodeURIComponent(tag.id)}`}
        prefetch={false}
        className={`${styles.chip} ${tag.kind === "champion" ? styles.champion : styles.item}`}
        aria-label={`${name}, ${kindLabel.toLowerCase()}`}
        aria-describedby={open ? cardId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
            setFocused(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setFocused(false);
            setHover(false);
          }
        }}
      >
        {/* Plain img: next.config keeps remote image patterns Riot-only by design. */}
        <img src={icon} alt="" width={18} height={18} loading="lazy" />
        <span>{name}</span>
      </Link>
      {open && (
        <span className={styles.card} role="tooltip" id={cardId}>
          <span className={styles.cardHead}>
            <img src={icon} alt="" width={44} height={44} loading="lazy" />
            <span>
              <span className={styles.cardName}>{name}</span>
              {champion && <span className={styles.cardSub}>{champion.title}</span>}
              {item && (
                <span className={styles.cardSub}>
                  <strong>{item.gold} gold</strong>
                  {!item.shop && " · Not in the current shop"}
                </span>
              )}
              {!champion && !item && <span className={styles.cardSub}>{kindLabel}</span>}
            </span>
          </span>
          {champion && champion.tags.length > 0 && <span className={styles.cardEffect}>{champion.tags.join(" · ")}</span>}
          {item?.effect && <span className={styles.cardEffect}>{item.effect}</span>}
          {catalog && !champion && !item && (
            <span className={styles.cardEffect}>Not in the current patch catalog.</span>
          )}
          <span className={styles.cardKind}>{kindLabel}</span>
        </span>
      )}
    </span>
  );
}

/** Render a body with tag tokens as chips and everything else as plain text. */
export function TaggedText({ body }: { body: string }) {
  const segments = parseBodySegments(body);
  return (
    <>
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <GameTagChip key={i} tag={segment.tag} />
        ),
      )}
    </>
  );
}
