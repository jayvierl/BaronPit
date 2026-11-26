"use client";

import { useRef } from "react";

export function ExploreMenu({ children, menuId = "explore-destinations" }: { children: React.ReactNode; menuId?: string }) {
  const menu = useRef<HTMLElement>(null);
  return (
    <div className="explore-menu">
      <button type="button" className="btn small secondary" popoverTarget={menuId}>
        Explore <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <nav
        ref={menu}
        id={menuId}
        popover="auto"
        aria-label="Explore destinations"
        onClick={(e) => {
          if (e.target instanceof Element && e.target.closest("a")) menu.current?.hidePopover();
        }}
      >
        {children}
      </nav>
    </div>
  );
}
