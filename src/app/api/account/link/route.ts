import { NextResponse } from "next/server";
import { requireUser, readObject } from "@/lib/auth-http";
import { rateLimit } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { lookupPlayer, isPlatform } from "@/lib/riot";
import { ensureRooms } from "@/lib/social";

/**
 * Claim-style Riot ID linking: the account asserts ownership of a Riot ID.
 * This is NOT verified ownership — verified linking arrives with Riot Sign On
 * once Riot approves the production application (App 911877). The data model
 * keeps the two states separate (wp_links.verified).
 */
export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const { platform, gameName, tagLine } = (await readObject(req)) as {
    platform?: string; gameName?: string; tagLine?: string;
  };
  if (!platform || !isPlatform(platform) || typeof gameName !== "string" || !gameName.trim() || gameName.length > 32 || typeof tagLine !== "string" || !tagLine.trim() || tagLine.length > 8) {
    return NextResponse.json({ ok: false, error: "Give a platform and a full Riot ID (Name#TAG)." }, { status: 400 });
  }
  if (!await rateLimit(user.id, "riot-link", 6, 15)) {
    return NextResponse.json({ok:false,error:"Too many lookup attempts. Try linking again in 15 minutes."},{status:429});
  }
  const result = await lookupPlayer(platform, gameName.trim(), tagLine.trim());
  if (!result.ok) {
    const message = result.code === "not_found" ? "That Riot ID wasn't found on that platform."
      : result.code === "key_unavailable" ? "Player lookup is briefly unavailable (API key rotation)."
      : "Player lookup failed — try again in a moment.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  if (result.source === "partial") {
    return NextResponse.json({ ok: false, error: "Riot returned part of this profile. Try linking again when the full lookup is available." }, { status: 503 });
  }
  const player = result.player;
  await ensureRooms();
  const sql = await getSql();
  const suggested = ["general", ...player.snapshot.champPool.slice(0,3).map(c=>"champ-"+c.champion.toLowerCase())];
  // The per-account lock serializes concurrent linking and primary reassignment.
  await sql.transaction([
    sql`SELECT id FROM wp_users WHERE id=${user.id} FOR UPDATE`,
    sql`INSERT INTO wp_links (user_id,puuid,is_primary,verified)
      VALUES (${user.id},${player.puuid},NOT EXISTS(SELECT 1 FROM wp_links WHERE user_id=${user.id} AND is_primary),false)
      ON CONFLICT(user_id,puuid) DO NOTHING`,
    sql`INSERT INTO wp_room_members(room_id,user_id) SELECT id,${user.id} FROM wp_rooms
      WHERE slug=ANY(${suggested}::text[]) ON CONFLICT DO NOTHING`,
  ]);
  return NextResponse.json({ ok: true, riotId: `${player.gameName}#${player.tagLine}` });
}
