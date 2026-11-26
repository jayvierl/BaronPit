import { NextResponse } from "next/server";
import { acceptedBand, TERMS_VERSION } from "@/lib/account-policy";
import { authError, requireUser, readObject } from "@/lib/auth-http";
import { q } from "@/lib/db";

export async function POST(req: Request) {
  const access = await requireUser(req, "protect");
  if (!access.ok) return access.response;
  const band = acceptedBand(await readObject(req));
  if (!band) return authError("Confirm eligibility and accept the current terms.",400);
  const rows = await q`UPDATE wp_users SET age_band=${band}, terms_version=${TERMS_VERSION}, terms_accepted_at=now()
    WHERE id=${access.user.id} AND (age_band IS NULL OR age_band=${band}) RETURNING id`;
  if (!rows.length) return authError("Contact support to correct the age group on your account.",409);
  return NextResponse.json({ok:true});
}
