import { getCurrentUser } from "@/lib/auth";
import { duoCalendar, upcomingDuoSession } from "@/lib/duo-reminder";
import { shareOrigin } from "@/lib/share-metadata";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    const user = await getCurrentUser();
    if (!user) return new Response("Sign in to see your duo sessions.", { status: 401, headers });
    const start = /^[1-9]\d{0,9}$/.test(id) ? await upcomingDuoSession(user.id, Number(id)) : null;
    const now = new Date();
    if (!start || start <= now) return new Response("This duo reminder is unavailable.", { status: 404, headers });
    return new Response(duoCalendar(Number(id), start, now, shareOrigin()), {
      headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="duo-session.ics"' },
    });
  } catch {
    return new Response("Your duo reminder could not load. Try again shortly.", { status: 503, headers });
  }
}
