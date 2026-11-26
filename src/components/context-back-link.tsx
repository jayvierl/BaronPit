"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { previousAppPage } from "@/lib/navigation-context";
import { ThreadIcon } from "./thread-icon";

type BrowserNavigation = EventTarget & {
  currentEntry: { index: number } | null;
  entries(): { index: number; url: string | null }[];
};
function navigation() {
  return (window as Window & { navigation?: BrowserNavigation }).navigation;
}
function previousEntry() {
  const nav = navigation();
  const index = nav?.currentEntry?.index;
  if (!nav || index == null || index < 1) return null;
  const entries = nav.entries();
  const current = new URL(window.location.href);
  for (let offset = index - 1; offset >= 0; offset--) {
    const previous = entries[offset];
    if (previous?.index !== offset || !previous.url) return null;
    const url = new URL(previous.url);
    // Hash links are positions inside a thread, not a different source page.
    if (url.origin === current.origin && url.pathname === current.pathname && url.search === current.search) continue;
    const href = previousAppPage(previous.url, current.href);
    return href ? { href, offset: offset - index } : null;
  }
  return null;
}
const previousRoute = () => previousEntry()?.href ?? null;
function subscribe(callback: () => void) {
  const nav = navigation();
  nav?.addEventListener("currententrychange", callback);
  return () => nav?.removeEventListener("currententrychange", callback);
}

export function ContextBackLink({ fallback, fallbackLabel }: { fallback: string; fallbackLabel: string }) {
  const previous = useSyncExternalStore(subscribe, previousRoute, () => null);
  const label = previous ? "Back to previous page" : fallbackLabel;
  return <Link href={previous ?? fallback} prefetch={false} aria-label={label} title={label}
    onNavigate={event => {
      const entry = previousEntry();
      if (entry && entry.href === previous) {
        event.preventDefault();
        window.history.go(entry.offset);
      }
    }}>
    <ThreadIcon name="back"/>
  </Link>;
}
