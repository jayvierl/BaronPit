"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { TagRef } from "@/lib/game-tags";
import styles from "./tag-suggest.module.css";

export type TagOption = { tag: TagRef; detail: string; icon?: string };
export type TagField = HTMLInputElement | HTMLTextAreaElement;

type Props = {
  anchor: TagField;
  id: string;
  options: TagOption[];
  active: number;
  status: string;
  interactingRef: RefObject<boolean>;
  onActive: (index: number) => void;
  onSelect: (option: TagOption) => void;
  onDismiss: () => void;
};

export function TagPickerMenu({ anchor, id, options, active, status, interactingRef, onActive, onSelect, onDismiss }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: number; index: number; x: number; y: number } | null>(null);

  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const popup = menu.current;
    if (!popup) return;
    const viewport = window.visualViewport;
    function position() {
      if (!popup) return;
      const field = anchor.getBoundingClientRect();
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? document.documentElement.clientWidth;
      const height = viewport?.height ?? window.innerHeight;
      const availableBelow = y + height - field.bottom - 12;
      const availableAbove = field.top - y - 12;
      const above = availableBelow < 220 && availableAbove > availableBelow;
      const menuWidth = Math.min(Math.max(256, field.width), width - 16);
      Object.assign(popup.style, {
        width: `${menuWidth}px`,
        left: `${Math.max(x + 8, Math.min(field.left, x + width - menuWidth - 8))}px`,
        top: `${above ? field.top - 5 : field.bottom + 5}px`,
        transform: above ? "translateY(-100%)" : "",
        maxHeight: `${Math.max(0, Math.min(264, above ? availableAbove : availableBelow))}px`,
        visibility: field.bottom <= y || field.top >= y + height ? "hidden" : "visible",
      });
    }
    position();
    const resize = new ResizeObserver(position);
    resize.observe(anchor);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    viewport?.addEventListener("resize", position);
    viewport?.addEventListener("scroll", position);
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      viewport?.removeEventListener("resize", position);
      viewport?.removeEventListener("scroll", position);
      interactingRef.current = false;
    };
  }, [anchor, interactingRef]);

  useLayoutEffect(() => {
    const row = document.getElementById(`${id}-${active}`);
    const popup = menu.current;
    if (!row || !popup) return;
    if (row.offsetTop < popup.scrollTop) popup.scrollTop = row.offsetTop;
    if (row.offsetTop + row.offsetHeight > popup.scrollTop + popup.clientHeight)
      popup.scrollTop = row.offsetTop + row.offsetHeight - popup.clientHeight;
  }, [active, id]);

  return createPortal(
    <div ref={menu} className={styles.menu}
      onPointerDownCapture={() => { interactingRef.current = true; }}
      onPointerCancel={() => { suppressClick.current = true; press.current = null; interactingRef.current = false; if (document.activeElement !== anchor) onDismiss(); }}
      onPointerUp={() => { interactingRef.current = false; }}>
      <ul id={id} role="listbox" aria-label="Tag suggestions">
        {options.map((option, index) => (
          <li key={`${option.tag.kind}:${option.tag.id}:${option.tag.name}`} id={`${id}-${index}`}
            role="option" aria-selected={active === index} className={styles.option}
            onPointerMove={event => { if (event.pointerType === "mouse" && !event.buttons) onActive(index); }}
            onPointerDown={event => {
              if (!event.isPrimary || event.button !== 0) return;
              suppressClick.current = false;
              press.current = { id: event.pointerId, index, x: event.clientX, y: event.clientY };
              event.preventDefault(); // Keep the keyboard and original edit selection.
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={event => {
              const start = press.current;
              press.current = null;
              interactingRef.current = false;
              if (!start || start.id !== event.pointerId || start.index !== index) return;
              suppressClick.current = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10;
              // Keep the option mounted through the native click. Removing it on
              // pointerup lets a mobile browser click the control underneath it.
            }}
            onClick={event => {
              event.preventDefault();
              if (event.detail === 0 || !suppressClick.current) onSelect(option);
              event.stopPropagation();
            }}>
            {option.icon ? <img src={option.icon} alt="" width={28} height={28}/> : <span className={styles.at} aria-hidden="true">@</span>}
            <strong>{option.tag.name}</strong> <small>{option.detail}</small>
          </li>
        ))}
      </ul>
      {status && <p role="status">{status}</p>}
    </div>, anchor.closest("dialog[open]") ?? document.body,
  );
}
