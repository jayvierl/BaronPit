import { NextResponse } from "next/server";
import { dbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// Liveness is always ok while the process can answer. Readiness (?ready=1)
// additionally reports whether community storage is configured (dbAvailable),
// without exposing any internals.
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("ready") === "1") {
    return dbAvailable()
      ? NextResponse.json({ ok: true, db: true })
      : NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
