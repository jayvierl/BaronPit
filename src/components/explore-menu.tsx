"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./navigation.module.css";

export function ExploreMenu({ children, menuId = "explore-destinations" }: { children: ReactNode; menuId?: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const menu = details.current;
    if (!open || !menu) return;
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      menu.open = false;
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <details className={styles.explore} ref={details} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary ref={trigger} aria-label="Explore" aria-controls={menuId} title="Explore" className={styles.exploreTrigger}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16M4 15h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
      </summary>
      <nav id={menuId} className={styles.destinations} aria-label="Explore destinations" onClick={event => {
        if (event.target instanceof Element && event.target.closest("a") && details.current) details.current.open = false;
      }}>
        {children}
      </nav>
    </details>
  );
}
