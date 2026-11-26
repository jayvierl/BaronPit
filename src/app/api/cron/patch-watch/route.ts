import { NextResponse } from "next/server";
import { runPatchWatch } from "@/lib/social";

/**
 * Daily patch watch (Vercel cron). Idempotent: only posts briefings when
 * Data Dragon reports a patch newer than the last one seen.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPatchWatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "patch watch failed" }, { status: 500 });
  }
}
