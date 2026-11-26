"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
function previousRoute() {
  const nav = navigation();
  const index = nav?.currentEntry?.index;
  if (!nav || index == null || index < 1) return null;
  return previousAppPage(nav.entries().find(entry => entry.index === index - 1)?.url, window.location.href);
}
function subscribe(callback: () => void) {
  const nav = navigation();
  nav?.addEventListener("currententrychange", callback);
  return () => nav?.removeEventListener("currententrychange", callback);
}

export function ContextBackLink({ fallback, fallbackLabel }: { fallback: string; fallbackLabel: string }) {
  const router = useRouter();
  const previous = useSyncExternalStore(subscribe, previousRoute, () => null);
  const label = previous ? "Back to previous page" : fallbackLabel;
  return <Link href={previous ?? fallback} prefetch={false} aria-label={label} title={label}
    onNavigate={event => {
      if (previous && previous === previousRoute()) {
        event.preventDefault();
        router.back();
      }
    }}>
    <ThreadIcon name="back"/>
  </Link>;
}
