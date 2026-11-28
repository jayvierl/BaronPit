"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client";
import type { ReviewRole } from "@/lib/review-hour-time";

const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function LocalReviewTime({ start, end }: { start: string; end: string }) {
  const router = useRouter();
  const zone = useSyncExternalStore(subscribe, browserZone, () => "UTC");
  const first = new Date(start),
    last = new Date(end);
  useEffect(() => {
    const future = [Date.parse(start), Date.parse(end)].filter((instant) => instant > Date.now());
    if (!future.length) {
      router.refresh();
      return;
    }
    const timers = future.map((instant) =>
      window.setTimeout(() => router.refresh(), instant - Date.now() + 250),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [start, end, router]);
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: zone,
  });
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });
  const finish = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
    timeZoneName: "short",
  });
  return (
    <time dateTime={start}>
      {date.format(first)} · {time.format(first)}–{finish.format(last)}
    </time>
  );
}

/** The recurring weekly slot (Saturday 21:00 UTC) expressed in the
 * viewer's timezone: the session's own start instant carries the local
 * weekday and time of the weekly recurrence. */
export function LocalReviewSchedule({ start }: { start: string }) {
  const zone = useSyncExternalStore(subscribe, browserZone, () => "UTC");
  const at = new Date(start);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: zone }).format(at);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short",
  }).format(at);
  return <>Every {weekday} at {time} for one hour.</>;
}

export function HostAction({ start, role, own }: { start: string; role: ReviewRole; own: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function update() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const result = await postJson("/api/review-hour", { action: own ? "withdraw" : "confirm", role, start });
    setBusy(false);
    setNotice(
      result.ok
        ? own
          ? "You withdrew from this session."
          : "Your host slot is confirmed."
        : result.data.error,
    );
    if (result.ok) router.refresh();
  }
  return (
    <div>
      <button type="button" className="btn small" onClick={update} disabled={busy}>
        {busy ? "Saving…" : own ? "Withdraw" : `Host as ${role === "Bot" ? "bot carry" : "support"}`}
      </button>
      {notice && (
        <span className="meta" role="status">
          {" "}
          {notice}
        </span>
      )}
    </div>
  );
}
