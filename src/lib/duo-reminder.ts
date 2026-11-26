import { TERMS_VERSION } from "./account-policy";
import { queryRows } from "./db";
import { duoEnabled, duoPairsCte } from "./duo";
import { SESSION_MINUTES } from "./duo-session";
import { validId } from "./ids";

export async function upcomingDuoSession(userId: number, id: number) {
  if (!duoEnabled() || !validId(id)) return null;
  const rows = await queryRows(duoPairsCte + `
    SELECT session_start FROM pairs
    WHERE id=$3 AND status='accepted' AND can_cancel AND session_start>clock_timestamp()`, [userId, TERMS_VERSION, id]);
  return rows.length ? new Date(String(rows[0].session_start)) : null;
}

const utcStamp = (value: Date) => value.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";

/** A private, portable calendar event with no participant names, Riot IDs or sign-in tokens. */
export function duoCalendar(id: number, start: Date, now: Date, origin: string | null) {
  const end = new Date(start.getTime() + SESSION_MINUTES * 60_000);
  const advance = start.getTime() - now.getTime() >= 600_000;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Duo Sessions//Calendar//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:duo-${id}@wp-duo.calendar.invalid`, `DTSTAMP:${utcStamp(now)}`, `DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`,
    "SUMMARY:Duo session", "CLASS:PRIVATE", "STATUS:CONFIRMED",
    "DESCRIPTION:Check your duo invitation before joining.",
    ...(origin ? [`URL:${origin}/activity?tab=duos`] : []),
    "BEGIN:VALARM", "ACTION:DISPLAY", advance ? "TRIGGER:-PT10M" : "TRIGGER:PT0M",
    "DESCRIPTION:Your duo session is coming up.", "END:VALARM", "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(line => line.match(/.{1,73}/g)!.join("\r\n ")).join("\r\n") + "\r\n";
}
