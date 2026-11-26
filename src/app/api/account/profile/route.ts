import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { q } from "@/lib/db";
import { scoreContent } from "@/lib/moderation";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { displayName, bio } = (await req.json().catch(() => ({}))) as { displayName?: string; bio?: string };
  const name = (displayName ?? "").trim();
  const bioText = (bio ?? "").trim().slice(0, 280);
  if (name.length < 2 || name.length > 40) {
    return NextResponse.json({ ok: false, error: "Display names are 2–40 characters." }, { status: 400 });
  }
  // Names get the strictest moderation pass (spec §2.1).
  if (scoreContent(name, {}).action !== "publish" || scoreContent(bioText, {}).action === "block") {
    return NextResponse.json({ ok: false, error: "That name or bio trips our safety filter — try another." }, { status: 400 });
  }
  await q`UPDATE wp_users SET display_name = ${name}, bio = ${bioText} WHERE id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
