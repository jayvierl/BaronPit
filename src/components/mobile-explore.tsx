"use client";

import { useRef } from "react";

export function MobileExplore({ children }: { children: React.ReactNode }) {
  const menu = useRef<HTMLElement>(null);
  return (
    <div className="mobile-explore">
      <button type="button" className="btn small secondary" popoverTarget="explore-destinations">
        Explore
      </button>
      <nav
        ref={menu}
        id="explore-destinations"
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
