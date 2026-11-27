"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { playerDisplayTime } from "@/lib/player-display-time";
import styles from "./refresh-player.module.css";

type Source = "cache" | "live" | "stale" | "partial";

export function RefreshPlayer({ href, fetchedAt, source, requested = false, retryAt }: {
  href: string;
  fetchedAt: string;
  source: Source;
  requested?: boolean;
  retryAt?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const params = new URL(href, "https://player.invalid").searchParams;
  params.set("force", "1");
  params.delete("updateAttempt");
  const capturedAt = playerDisplayTime(fetchedAt);
  const retryAfter = playerDisplayTime(retryAt, true);
  const notice = source === "stale" ? "Riot couldn’t update this profile. Showing the last saved record."
    : source === "partial" ? "Riot returned only part of this profile."
    : requested && source === "cache" ? "Checked recently."
    : requested ? "Stats updated." : null;

  useEffect(() => {
    if (pending) return;
    const url = new URL(window.location.href);
    if (url.pathname !== "/player" || url.searchParams.get("force") !== "1") return;
    url.searchParams.delete("force");
    url.searchParams.delete("updateAttempt");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [pending]);

  return (
    <div className={styles.update}>
      <form action="/player" method="get" onSubmit={event => {
        event.preventDefault();
        if (pending) return;
        // A distinct navigation asks the server again even if the previous attempt hit its cooldown.
        const query = new URLSearchParams(params);
        query.set("updateAttempt", event.timeStamp.toString(36));
        const hash = window.location.hash;
        start(() => router.replace(`/player?${query}${hash}`, { scroll: false }));
      }}>
        {[...params].map(([name, value]) => <input key={`${name}-${value}`} type="hidden" name={name} value={value} />)}
        <button type="submit" className="btn secondary" disabled={pending} aria-busy={pending}>
          {pending ? "Updating…" : "Update"}
        </button>
      </form>
      <div className={styles.message} role="status">
        {capturedAt ? <p>
          {source === "partial" ? "Last checked" : "Last updated"}{" "}<time dateTime={capturedAt.dateTime}>{capturedAt.label}</time>
        </p> : <p>Update time unavailable.</p>}
        {pending ? <p>Checking Riot for new stats.</p> : <>
          {notice && <p>{notice}</p>}
          {retryAfter && <p>Try again after <time dateTime={retryAfter.dateTime}>{retryAfter.label}</time>.</p>}
        </>}
      </div>
    </div>
  );
}
