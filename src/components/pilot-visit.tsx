"use client";
import { useEffect, useRef } from "react";
import type { PilotPage } from "@/lib/pilot";

/** Mount only for enrolled viewers. Next prefetch and background tabs are excluded. */
export function PilotVisit({ kind, postId }: { kind: PilotPage; postId?: number }) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let sent = false;
    let inView = kind !== "answer";
    let timer: ReturnType<typeof setTimeout> | undefined;
    function visible() {
      clearTimeout(timer);
      if (sent || !inView || document.visibilityState !== "visible") return;
      timer = setTimeout(
        () => {
          sent = true;
          void fetch("/api/pilot", {
            method: "POST",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "visit", kind, ...(kind === "answer" && { postId }) }),
          }).catch(() => {});
        },
        kind === "answer" ? 1000 : 0,
      );
    }
    // Placed at the end of a helpful answer. This is a visible-view proxy, not proof of comprehension.
    const observer =
      kind === "answer" && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            visible();
          })
        : null;
    if (observer && marker.current) observer.observe(marker.current);
    document.addEventListener("visibilitychange", visible);
    visible();
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [kind, postId]);

  return kind === "answer" ? (
    <span ref={marker} aria-hidden="true" style={{ display: "block", height: 1 }} />
  ) : null;
}
