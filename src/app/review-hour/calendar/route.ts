import { shareOrigin } from "@/lib/discussion-library-preview";
import { reviewHour } from "@/lib/review-hour-time";

// Calendar links include the displayed date so an old browser tab cannot silently book a different week.
export function GET(request: Request) {
  const session = reviewHour();
  const day = new URL(request.url).searchParams.get("day");
  if (day !== session.start.slice(0, 10))
    return new Response("This session has ended. Open the review hour to add the next one.", {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    });
  const timestamp = (iso: string) => iso.slice(0, 19).replace(/[-:]/g, "") + "Z";
  const origin = shareOrigin();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Community Calendar//Bot lane review//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:bot-lane-review-${day}@community-calendar.invalid`,
    `DTSTAMP:${timestamp(new Date().toISOString())}`,
    `DTSTART:${timestamp(session.start)}`,
    `DTEND:${timestamp(session.end)}`,
    "SUMMARY:Bot lane review hour",
    "DESCRIPTION:Discuss Support and Bot questions in the matchup notebook.",
    ...(origin ? [`URL:${origin}/review-hour`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // Calendar values here are ASCII (URL.origin serializes domains in ASCII).
  const calendar = lines.map((line) => line.match(/.{1,73}/g)!.join("\r\n ")).join("\r\n") + "\r\n";
  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="bot-lane-review-${day}.ics"`,
    },
  });
}
