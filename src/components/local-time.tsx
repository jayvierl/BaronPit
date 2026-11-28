"use client";

import { useBrowserTimeZone } from "./duo-time-zone";

/** An instant rendered in the viewer's own timezone, with its zone
 * abbreviation. The server snapshot is UTC (the established pattern from
 * LocalReviewTime and DuoTimeZone), so hydration swaps in the local zone
 * without a text mismatch. */
export function LocalTime({ iso, format }: {
  iso: string;
  format: Intl.DateTimeFormatOptions;
}) {
  const zone = useBrowserTimeZone();
  const at = new Date(iso);
  if (!Number.isFinite(at.valueOf())) return null;
  const label = new Intl.DateTimeFormat("en-US", { ...format, timeZone: zone, timeZoneName: "short" }).format(at);
  return <time dateTime={at.toISOString()} suppressHydrationWarning>{label}</time>;
}
