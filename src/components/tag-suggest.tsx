"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  applyTag,
  championIconUrl,
  itemIconUrl,
  pickSuggestion,
  plainBodyText,
  type Suggestion,
  type TagCatalog,
  type TagChampion,
  type TagItem,
  type TagRef,
} from "@/lib/game-tags";
import { editedTagDraft, sliceTagDraft } from "@/lib/tag-editing";
import { loadTagCatalog } from "@/lib/game-tags-client";
import styles from "./tag-suggest.module.css";

/** Relative wrapper the field and its suggestion menu live in. */
export function TagFieldWrap({ children }: { children: ReactNode }) {
  return <div className={styles.wrap}>{children}</div>;
}

type Field = HTMLInputElement | HTMLTextAreaElement;
type Option =
  | { kind: "champion"; entry: TagChampion }
  | { kind: "item"; entry: TagItem };

/**
 * Champion/item autocomplete for a plain text field. As the author types,
 * the trailing phrase is matched against the Data Dragon catalog (see
 * pickSuggestion for the trigger rules); choosing an entry replaces the
 * phrase with a structured tag token. The consumer keeps owning the
 * field's value: call `update` from its onChange/onSelect, spread
 * `fieldProps` on the field, and render `menu` beside it inside a
 * TagFieldWrap.
 */
export function useTagSuggest({
  inputRef,
  value,
  apply,
  enabled = true,
  limit,
}: {
  inputRef: RefObject<Field | null>;
  value: string;
  apply: (next: string) => void;
  enabled?: boolean;
  limit: number;
}) {
  const [catalog, setCatalog] = useState<TagCatalog | null>(null);
  const [candidate, setPick] = useState<Suggestion | null>(null);
  const [limitNotice, setLimitNotice] = useState("");
  const [active, setActive] = useState(0);
  const suppressedFor = useRef<string | null>(null);
  const pendingCaret = useRef<number | null>(null);

  // External value changes (draft restore, clear after posting) invalidate
  // a pick that no longer matches the text at its position.
  const display = plainBodyText(value);
  const pick = enabled && candidate && display.slice(candidate.start, candidate.start + candidate.phrase.length) === candidate.phrase
    ? candidate : null;

  useEffect(() => {
    if (pendingCaret.current === null) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    const field = inputRef.current;
    if (field) {
      field.focus();
      field.setSelectionRange(caret, caret);
    }
  }, [value, inputRef]);

  function ensureCatalog() {
    if (enabled && !catalog) void loadTagCatalog().then(setCatalog);
  }

  function update(field: Field, body = value) {
    if (!enabled) {
      setPick(null);
      return;
    }
    if (suppressedFor.current !== null && field.value !== suppressedFor.current) {
      suppressedFor.current = null;
    }
    if (!catalog || suppressedFor.current !== null) {
      setPick(null);
      return;
    }
    const next = pickSuggestion(catalog, field.value, field.selectionStart ?? field.value.length);
    setPick(next && sliceTagDraft(body, next.start, next.end) === field.value.slice(next.start, next.end) ? next : null);
    setActive(0);
  }

  const options: Option[] = pick
    ? [
        ...pick.matches.champions.map((entry) => ({ kind: "champion" as const, entry })),
        ...pick.matches.items.map((entry) => ({ kind: "item" as const, entry })),
      ]
    : [];

  function choose(option: Option) {
    if (!pick) return;
    const tag: TagRef = { kind: option.kind, id: String(option.entry.id), name: option.entry.name };
    const before = sliceTagDraft(value, 0, pick.start);
    const after = sliceTagDraft(value, pick.end);
    const result = applyTag(before + display.slice(pick.start, pick.end) + after,
      { ...pick, start: before.length, end: before.length + pick.end - pick.start }, tag);
    if (result.value.length > limit) {
      setLimitNotice("This tag exceeds the character limit.");
      setPick(null);
      return;
    }
    pendingCaret.current = plainBodyText(result.value.slice(0, result.caret)).length;
    setPick(null);
    apply(result.value);
  }

  function onKeyDown(event: KeyboardEvent<Field>) {
    if (event.nativeEvent.isComposing || !pick || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      suppressedFor.current = value;
      setPick(null);
    }
  }

  const fieldProps = {
    onFocus: ensureCatalog,
    onKeyDown,
    onSelect: (event: { currentTarget: Field }) => update(event.currentTarget),
    onBlur: () => setPick(null),
    "aria-expanded": !!pick,
    "aria-autocomplete": "list" as const,
  };

  const menu = pick && options.length > 0 && catalog ? (
    <ul className={styles.menu} role="listbox" aria-label="Champion and item suggestions">
      {options.map((option, i) => {
        const icon = option.kind === "champion"
          ? championIconUrl(catalog.championPatch, option.entry.id)
          : itemIconUrl(catalog.itemPatch, option.entry.id);
        return (
          <li key={`${option.kind}:${option.entry.id}`} role="option" aria-selected={i === active}>
            <button
              type="button"
              className={styles.option}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              onMouseEnter={() => setActive(i)}
            >
              <img src={icon} alt="" width={24} height={24} loading="lazy" />
              <span className={styles.optionName}>{option.entry.name}</span>
              {option.kind === "item" && <span className={styles.gold}>{option.entry.gold} g</span>}
              <span className={`${styles.kind} ${option.kind === "champion" ? styles.kindChampion : styles.kindItem}`}>
                {option.kind === "champion" ? "Champion" : "Item"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  function change(field: Field) {
    setLimitNotice("");
    const body = editedTagDraft(value, field.value, field.selectionEnd ?? field.value.length);
    apply(body);
    update(field, body);
  }
  return { display, change, maxLength: limit - (value.length - display.length), fieldProps,
    menu: limitNotice ? <small role="status">{limitNotice}</small> : menu };

}
