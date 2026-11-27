// Quarter-hour UTC slots cover modern IANA offsets, including Kathmandu and Chatham Islands.
// Walking real instants handles repeated and skipped local hours at daylight-saving transitions.
export const SLOT_MS = 15 * 60_000;
export const scheduleHours = "Mornings 06:00–12:00, afternoons 12:00–18:00, evenings 18:00–00:00, late nights 00:00–06:00.";
export type PlayWindow = [start: number, end: number];
const partsOfDay = ["late nights", "mornings", "afternoons", "evenings"] as const;

export function timeZoneName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80 || !/^(?:UTC|GMT|[A-Za-z][A-Za-z0-9_-]*(?:\/[A-Za-z0-9_+-]+)+)$/i.test(value)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {timeZone: value}).resolvedOptions().timeZone;
  } catch { return null; }
}

export function scheduleWindows(blocks: readonly string[], zone: string | null | undefined, since: number, days = 7): PlayWindow[] {
  if (!blocks.length || !zone || !timeZoneName(zone)) return [];
  const format = new Intl.DateTimeFormat("en-US", {timeZone:zone, weekday:"short", hour:"2-digit", hourCycle:"h23"});
  const selected = new Set(blocks);
  const windows: PlayWindow[] = [];
  const start = Math.floor(since / SLOT_MS);
  for (let slot = start; slot < start + days * 96; slot++) {
    const parts = format.formatToParts(slot * SLOT_MS);
    const day = parts.find(p => p.type === "weekday")!.value;
    const hour = Number(parts.find(p => p.type === "hour")!.value);
    const block = (day === "Sat" || day === "Sun" ? "Weekend " : "Weekday ") + partsOfDay[Math.floor(hour / 6)];
    if (!selected.has(block)) continue;
    const previous = windows.at(-1);
    if (previous?.[1] === slot) previous[1]++;
    else windows.push([slot, slot + 1]);
  }
  return windows;
}

export function encodeWindows(windows: PlayWindow[]): string {
  return "{" + windows.map(([start,end]) => `[${start},${end})`).join(",") + "}";
}

export function sharedWindows(a: PlayWindow[], b: PlayWindow[]): PlayWindow[] {
  const shared: PlayWindow[] = [];
  for (const [start,end] of a) {
    for (const [otherStart,otherEnd] of b) {
      const from = Math.max(start, otherStart);
      const to = Math.min(end, otherEnd);
      if (from < to) shared.push([from, to]);
    }
  }
  return shared;
}

export function overlaps(a: PlayWindow[], b: PlayWindow[]): boolean {
  return a.some(([start,end]) => b.some(([otherStart,otherEnd]) => start < otherEnd && otherStart < end));
}

export function scheduleRange(start: number, end: number, zone: string) {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const zoneAt = (instant: number) => format.formatToParts(instant).find(part => part.type === "timeZoneName")?.value;
  return zoneAt(start) !== zoneAt(end) ? `${format.format(start)} – ${format.format(end)}` : format.formatRange(start, end);
}

export function nextWindowLabel(windows: PlayWindow[], zone: string, since: number): string | null {
  const next = windows.find(([,end]) => end * SLOT_MS > since);
  if (!next) return null;
  return scheduleRange(next[0] * SLOT_MS, next[1] * SLOT_MS, zone);
}
