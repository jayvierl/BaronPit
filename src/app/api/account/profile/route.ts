import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { q } from "@/lib/db";
import { scoreContent } from "@/lib/moderation";
import { screenText } from "@/lib/managed-text-screen";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { displayName, bio } = (await readObject(req)) as { displayName?: string; bio?: string };
  const name = typeof displayName === "string" ? displayName.trim() : "";
  const bioText = typeof bio === "string" ? bio.trim() : "";
  if (name.length < 2 || name.length > 40 || bioText.length > 280) {
    return NextResponse.json({ ok: false, error: "Display names are 2–40 characters." }, { status: 400 });
  }
  // Names get the strictest moderation pass (spec §2.1).
  const scored = [name,bioText].map(text=>scoreContent(text));
  const local = scored[0].score >= scored[1].score ? scored[0] : scored[1];
  const mod = await screenText(local,[name,bioText],user.id,"profile");
  if (mod.hits.includes("screening-unavailable")) return NextResponse.json({ok:false,error:"Profile screening is temporarily unavailable. Try saving your changes again later."},{status:503});
  if (mod.action !== "publish") {
    return NextResponse.json({ ok: false, error: "That name or bio trips our safety filter — try another." }, { status: 400 });
  }
  const updated = await q`UPDATE wp_users SET display_name = ${name}, bio = ${bioText} WHERE id = ${user.id} AND safety_status='visible' RETURNING id`;
  if (!updated.length) return NextResponse.json({ok:false,error:"Your profile is under safety review."},{status:409});
  return NextResponse.json({ ok: true });
}
