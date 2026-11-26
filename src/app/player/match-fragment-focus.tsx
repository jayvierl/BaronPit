"use client";

import { useEffect } from "react";
import { matchSectionId } from "@/lib/match-history";

export function MatchFragmentFocus() {
  useEffect(() => {
    const prefix = "#match-";
    const hash = window.location.hash;
    if (!hash.startsWith(prefix) || document.activeElement !== document.body) return;

    const id = matchSectionId(hash.slice(prefix.length));
    const row = id ? document.getElementById(id) : null;
    if (!row || row.tabIndex !== -1) return;

    const compactHistory = row.closest("details");
    if (compactHistory) compactHistory.open = true;
    const rowTop = row.getBoundingClientRect().top;
    const inset = Number.parseFloat(getComputedStyle(row).scrollMarginBlockStart) || 0;
    if (rowTop < inset - 1 || rowTop >= window.innerHeight) row.scrollIntoView({ block: "start" });
    row.focus({ preventScroll: true });
  }, []);

  return null;
}
