import { clearExpiredOwnership } from "@/lib/riot-ownership";
import { clearExpiredPilotData } from "@/lib/pilot";
import { NextResponse } from "next/server";
import { runPatchWatch } from "@/lib/social";
import { clearExpiredRoomTurns } from "@/lib/room-safety";
import { clearExpiredDuoListings } from "@/lib/duo";
import { clearExpiredAuthData } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [result] = await Promise.all([runPatchWatch(), clearExpiredAuthData(), clearExpiredDuoListings(), clearExpiredRoomTurns(), clearExpiredOwnership(), clearExpiredPilotData()]);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Scheduled update could not finish." }, { status: 503 });
  }
}
