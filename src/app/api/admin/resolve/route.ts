import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { adminResolve } from "@/lib/social";
import { q } from "@/lib/db";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    targetKind?: string; targetId?: number; action?: string; userId?: number;
  };
  if (body.action === "ban7d" && body.userId) {
    await q`UPDATE wp_users SET banned_until = now() + interval '7 days', strike_count = strike_count + 1 WHERE id = ${body.userId}`;
    await q`INSERT INTO wp_mod_log (target_kind, author_id, score, action, detail)
            VALUES ('user', ${body.userId}, 0, 'remove', '7-day suspension by a moderator')`;
    return NextResponse.json({ ok: true });
  }
  if (!body.targetId || !["post", "comment", "report"].includes(body.targetKind ?? "") || !["approve", "remove", "dismiss"].includes(body.action ?? "")) {
    return NextResponse.json({ ok: false, error: "Bad resolution." }, { status: 400 });
  }
  await adminResolve({
    targetKind: body.targetKind as "post" | "comment" | "report",
    targetId: body.targetId,
    action: body.action as "approve" | "remove" | "dismiss",
  });
  return NextResponse.json({ ok: true });
}
