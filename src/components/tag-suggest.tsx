"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { applyTag, championIconUrl, itemIconUrl, parseBodySegments, pickSuggestion, plainBodyText, playerTagRef,
  type TagCatalog } from "@/lib/game-tags";
import { editedTagDraft, sliceTagDraft } from "@/lib/tag-editing";
import { loadTagCatalog } from "@/lib/game-tags-client";
import type { SearchSuggestion } from "@/lib/search-suggestions";
import { TagPickerMenu, type TagOption, type TagField } from "./tag-picker-menu";
import styles from "./tag-suggest.module.css";

export function TagFieldWrap({ children }: { children: ReactNode }) {
  return <div className={styles.wrap}>{children}</div>;
}

type Range = { start: number; end: number };
type Candidate = Range & ({ kind: "player"; query: string } | { kind: "game"; options: TagOption[] });

function findCandidate(body: string, display: string, selection: Range, catalog: TagCatalog | null): Candidate | null {
  const { start, end } = selection;
  const before = display.slice(0, end);
  // Names can contain spaces; the hash marks the start of the Riot tagline.
  const mention = before.match(/(?:^|[\s([{])@([\p{L}\p{M}\p{N} _.'’–-]{0,40}(?:#[\p{L}\p{M}\p{N}]{0,16})?)$/u);
  let candidate: Candidate | null = null;
  if (mention) {
    const query = mention[1];
    const from = end - query.length - 1;
    const tail = display.slice(end).match(/^[\p{L}\p{M}\p{N}'’_-]*(?:#[\p{L}\p{M}\p{N}]+)?/u)?.[0] ?? "";
    if (start === end || start >= from) candidate = { kind: "player", query: query.trim(), start: from, end: end + tail.length };
  } else if (catalog) {
    // iOS autocorrection can select the just-typed word. Its start is before
    // the query, so match against the end and replace the selected range.
    const selected = end > start;
    const game = selected ? pickSuggestion(catalog, display.slice(start, end), end - start) : pickSuggestion(catalog, display, end);
    if (game) candidate = {
      kind: "game", start: (selected ? start : 0) + game.start, end: (selected ? start : 0) + game.end,
      options: [
        ...game.matches.champions.map(entry => ({
          tag: { kind: "champion" as const, id: entry.id, name: entry.name }, detail: "Champion", icon: championIconUrl(catalog.championPatch, entry.id),
        })),
        ...game.matches.items.map(entry => ({
          tag: { kind: "item" as const, id: String(entry.id), name: entry.name }, detail: "Item", icon: itemIconUrl(catalog.itemPatch, entry.id),
        })),
      ],
    };
  }
  if (!candidate) return null;
  let pos = 0;
  for (const segment of parseBodySegments(body)) {
    const next = pos + (segment.type === "tag" ? segment.tag.name : segment.text).length;
    if (segment.type === "tag" && pos < candidate.end && next > candidate.start) return null;
    pos = next;
  }
  return candidate;
}

type PlayerReply = { query: string; options: TagOption[]; unavailable: boolean };

function useMentionResults(query: string | null) {
  const [reply, setReply] = useState<PlayerReply | null>(null);
  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ scope: "mentions", q: query });
        const response = await fetch(`/api/search/suggestions?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const { suggestions }: { suggestions: SearchSuggestion[] } = await response.json();
        const options = suggestions.flatMap(entry => {
          if (entry.kind !== "player") return [];
          const tag = playerTagRef(entry.riotId, entry.platform, entry.mentionKey);
          return tag ? [{ tag, detail: entry.platform.toUpperCase() }] : [];
        });
        if (!controller.signal.aborted) setReply({ query, options, unavailable: false });
      } catch {
        if (!controller.signal.aborted) setReply({ query, options: [], unavailable: true });
      }
    }, 160);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  return query === reply?.query ? reply : null;
}

export function useTagSuggest({ inputRef, value, apply, enabled = true, limit }: {
  inputRef: RefObject<TagField | null>; value: string; apply: (next: string) => void; enabled?: boolean; limit: number;
}) {
  const id = useId();
  const [catalog, setCatalog] = useState<TagCatalog | null>(null);
  const [anchor, setAnchor] = useState<TagField | null>(null);
  const [selection, setSelection] = useState<Range | null>(null);
  const [active, setActive] = useState(0);
  const [feedback, setFeedback] = useState<{ body: string; message: string } | null>(null);
  const composing = useRef(false);
  const interactingRef = useRef(false);
  const nextCaret = useRef<number | null>(null);
  const display = plainBodyText(value);
  const candidate = useMemo(() => enabled && anchor && selection ? findCandidate(value, display, selection, catalog) : null,
    [value, display, selection, catalog, anchor, enabled]);
  const query = candidate?.kind === "player" ? candidate.query : null;
  const players = useMentionResults(query);
  const options = candidate?.kind === "game" ? candidate.options : players?.options ?? [];
  const current = Math.min(active, options.length - 1);

  function dismiss() {
    setSelection(null);
    setActive(0);
  }
  function track(field: TagField) {
    if (!enabled || interactingRef.current || composing.current || document.activeElement !== field) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    setSelection(old => old?.start === start && old.end === end ? old : { start, end });
  }

  useLayoutEffect(() => {
    if (nextCaret.current === null || !inputRef.current) return;
    const caret = nextCaret.current;
    nextCaret.current = null;
    inputRef.current.focus({ preventScroll: true });
    inputRef.current.setSelectionRange(caret, caret);
  }, [value, inputRef]);

  function choose(option: TagOption) {
    if (!candidate || !anchor || anchor.value !== display) return;
    const before = sliceTagDraft(value, 0, candidate.start);
    const after = sliceTagDraft(value, candidate.end);
    const phrase = display.slice(candidate.start, candidate.end);
    const result = applyTag(before + phrase + after, { start: before.length, end: before.length + phrase.length }, option.tag);
    dismiss();
    if (result.value.length > limit) {
      setFeedback({ body: value, message: "This tag exceeds the character limit." });
      return;
    }
    nextCaret.current = plainBodyText(result.value.slice(0, result.caret)).length;
    // Restore focus in the gesture itself so iOS keeps the software keyboard.
    anchor.focus({ preventScroll: true });
    setFeedback({ body: result.value, message: `Tagged ${option.tag.name}` });
    apply(result.value);
  }

  function onKeyDown(event: KeyboardEvent<TagField>) {
    if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !candidate) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (options.length && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      setActive((current + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (options[current] && event.key === "Enter") {
      event.preventDefault();
      choose(options[current]);
    }
  }

  const open = Boolean(anchor && candidate);
  let status = "";
  if (candidate?.kind === "player" && !options.length) {
    status = !players ? "Searching Riot IDs…" : players.unavailable ? "Player search is unavailable." : "No matching Riot IDs.";
  }
  const menu = <>
    {open && anchor && <TagPickerMenu anchor={anchor} id={id} options={options} active={current} status={status}
      interactingRef={interactingRef} onActive={setActive} onSelect={choose} onDismiss={dismiss}/>}
    {open && options.length > 0 && <span className="sr-only" role="status">{options.length} tag suggestions. Use the arrow keys and Enter to choose.</span>}
    {feedback?.body === value && <small role="status" className={styles.confirmation}>{feedback.message}</small>}
  </>;

  const fieldProps = {
    onFocus(event: { currentTarget: TagField }) {
      if (!enabled) return;
      setAnchor(event.currentTarget);
      if (!catalog) void loadTagCatalog().then(setCatalog);
      track(event.currentTarget);
    },
    onBlur() {
      if (interactingRef.current) return;
      setAnchor(null);
      dismiss();
    },
    onCompositionStart() { composing.current = true; dismiss(); },
    onCompositionEnd(event: { currentTarget: TagField }) { composing.current = false; track(event.currentTarget); },
    onKeyDown,
    onSelect(event: { currentTarget: TagField }) { track(event.currentTarget); },
    "aria-autocomplete": "list" as const,
    "aria-haspopup": "listbox" as const,
    "aria-controls": open ? id : undefined,
    "aria-activedescendant": open && current >= 0 ? `${id}-${current}` : undefined,
  };

  function change(field: TagField) {
    setFeedback(null);
    setActive(0);
    apply(editedTagDraft(value, field.value, field.selectionEnd ?? field.value.length));
    track(field);
  }
  const inputProps = { ...fieldProps, role: "combobox", "aria-expanded": open };
  return { display, change, maxLength: limit - (value.length - display.length), fieldProps, inputProps, menu };
}
