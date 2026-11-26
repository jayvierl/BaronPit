import { DUO_ROLES } from "./pure";
import { SLOT_MS, type PlayWindow } from "./duo-schedule";

export const SESSION_QUEUE = "normal-draft";
export const SESSION_QUEUE_LABEL = "Normal Draft";
export { SLOT_MS };
export const SESSION_MINUTES = 60;
const sessionSlots = SESSION_MINUTES / 15;
const planningSlots = 12; // A one-hour session ending within the listing's four-hour horizon.

export function sessionOptions(now: number): number[] {
  const first = Math.floor(now / SLOT_MS) + 1;
  return Array.from({length: planningSlots}, (_, offset) => (first + offset) * SLOT_MS);
}

export function validSessionStart(start: unknown, now = Date.now()): start is number {
  return typeof start === "number" && Number.isSafeInteger(start) && start % SLOT_MS === 0 &&
    start > now && start <= now + planningSlots * SLOT_MS;
}
export function sessionWindow(start: number): PlayWindow {
  const slot = start / SLOT_MS;
  return [slot, slot + sessionSlots];
}
export function coversSession(windows: PlayWindow[], session: PlayWindow) {
  return windows.some(([from,to]) => from <= session[0] && to >= session[1]);
}
export function sessionTime(start: number, zone: string) {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return format.formatRange(start, start + SESSION_MINUTES * 60_000);
}
export type SessionOffer = { queue: typeof SESSION_QUEUE; start: number; role: string; voice: boolean; vibe: "chill" | "tryhard" | "both" };
export function parseSessionOffer(value: unknown): SessionOffer | null {
  if (!value || typeof value !== "object") return null;
  const {queue, start, role, voice, vibe} = value as Record<string, unknown>;
  if (queue !== SESSION_QUEUE || !validSessionStart(start) || !DUO_ROLES.some(r => r === role) ||
      typeof voice !== "boolean" || (vibe !== "chill" && vibe !== "tryhard" && vibe !== "both")) return null;
  return {queue, start, role: String(role), voice, vibe};
}
