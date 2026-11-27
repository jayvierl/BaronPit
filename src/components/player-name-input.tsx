"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { PLATFORMS } from "@/lib/platforms";
import type { SearchSuggestion } from "@/lib/search-suggestions";
import styles from "./player-name-input.module.css";

type Props = {
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  scope: "all" | "players" | "people";
  region?: string;
  onSelect: (suggestion: SearchSuggestion) => void;
  required?: boolean;
  maxLength?: number;
};

type Reply = { key: string; suggestions: SearchSuggestion[]; failed?: boolean };

export function PlayerNameInput({ name, label, placeholder, value, onChange, scope, region, onSelect, required, maxLength = 80 }: Props) {
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [active, setActive] = useState(-1);
  const [reply, setReply] = useState<Reply | null>(null);
  const query = value.trim();
  const params = new URLSearchParams({ scope, q: query });
  if (region) params.set("region", region);
  const key = open && !composing && Array.from(query).length >= 2 && !query.startsWith("#") ? params.toString() : "";
  const current = key && reply?.key === key ? reply : null;
  const options = current?.suggestions ?? [];
  const expanded = Boolean(current);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggestions?${key}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Suggestions unavailable");
        const { suggestions } = await response.json();
        if (!Array.isArray(suggestions)) throw new Error("Invalid suggestions");
        if (!controller.signal.aborted) setReply({ key, suggestions });
      } catch {
        if (!controller.signal.aborted) setReply({ key, suggestions: [], failed: true });
      }
    }, 160);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key]);

  function close() {
    setOpen(false);
    setActive(-1);
    setReply(null);
  }

  function choose(option: SearchSuggestion) {
    close();
    onSelect(option);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (composing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape" && open && query) {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && options[active]) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      setOpen(true);
      if (!options.length) return;
      event.preventDefault();
      const next = event.key === "ArrowDown" ? (active + 1) % options.length
        : active <= 0 ? options.length - 1 : active - 1;
      setActive(next);
      list.current?.children[next]?.scrollIntoView({ block: "nearest" });
    }
  }

  const announcement = current?.failed ? "Suggestions are unavailable." : current && !options.length ? "No matching names."
    : options.length ? `${options.length} name suggestion${options.length === 1 ? "" : "s"} available.` : "";
  return <div className={styles.field}>
    <input type="search" role="combobox" name={name} value={value} placeholder={placeholder} aria-label={label}
      aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
      aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
      autoComplete="off" spellCheck={false} enterKeyHint="search" required={required} maxLength={maxLength}
      onChange={event => {
        const next = event.target.value;
        onChange(next);
        setActive(-1);
        if (next.trim() !== query) setReply(null);
        setOpen(true);
      }}
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={close} onKeyDown={keyDown}
      onCompositionStart={() => { setComposing(true); setActive(-1); }} onCompositionEnd={() => setComposing(false)}/>
    <div className={styles.popup} hidden={!expanded}>
      <ul id={listId} ref={list} role="listbox" aria-label="Name suggestions" className={styles.list}>
        {options.map((item, index) => {
          const player = item.kind === "player";
          const text = player ? item.riotId : item.name;
          const tag = player ? text.lastIndexOf("#") : -1;
          const detail = player ? PLATFORMS.find(p => p.id === item.platform)?.label ?? item.platform : "Community profile";
          return <li key={player ? `${item.platform}/${item.riotId}` : item.id} id={`${listId}-${index}`}
            role="option" aria-selected={active === index} className={styles.option}
            onPointerDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={() => choose(item)}>
            <span className={styles.identity}><strong>{tag < 0 ? text : text.slice(0, tag)}</strong>{tag >= 0 && <span>{text.slice(tag)}</span>}</span>{" "}
            <small>{detail}</small>
          </li>;
        })}
      </ul>
      {current && !options.length && <p className={styles.message} aria-hidden="true">{announcement}</p>}
    </div>
    <span role="status" className="sr-only">{announcement}</span>
  </div>;
}
