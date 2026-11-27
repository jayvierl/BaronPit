import { maintainPhotos } from "@/lib/profile-photo";
import { clearExpiredGameChecks } from "@/lib/duo-game-check";
import { clearExpiredOwnership } from "@/lib/riot-ownership";
import { clearExpiredPilotData } from "@/lib/pilot";
import { NextResponse } from "next/server";
import { runPatchWatch } from "@/lib/social";
import { clearExpiredRoomTurns } from "@/lib/room-safety";
import { clearExpiredDuoListings } from "@/lib/duo";
import { clearExpiredAuthData } from "@/lib/auth";
import { runDailyCall } from "@/lib/daily-call";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  }
  const task = new URL(req.url).searchParams.get("task");
  if (task === "daily-call") {
    try {
      return NextResponse.json({ ok: true, dailyCall: await runDailyCall() }, { headers });
    } catch {
      return NextResponse.json({ ok: false, error: "Daily Call could not finish." }, { status: 503, headers });
    }
  }
  if (task !== null) return NextResponse.json({ ok: false, error: "Unknown scheduled task." }, { status: 400, headers });
  const [patch, dailyCall, ...maintenance] = await Promise.allSettled([
    runPatchWatch(), runDailyCall(), clearExpiredAuthData(), clearExpiredDuoListings(), clearExpiredRoomTurns(),
    clearExpiredOwnership(), clearExpiredPilotData(), clearExpiredGameChecks(), maintainPhotos(),
  ]);
  const ok = patch.status === "fulfilled" && dailyCall.status === "fulfilled" && maintenance.every(task => task.status === "fulfilled");
  return NextResponse.json({ ok, ...(patch.status === "fulfilled" ? patch.value : {}),
    ...(dailyCall.status === "fulfilled" ? { dailyCall: dailyCall.value } : {}),
    ...(!ok ? { error: "Scheduled update could not finish." } : {}),
  }, { status: ok ? 200 : 503, headers });
}
