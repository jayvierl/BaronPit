import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { q } from "@/lib/db";
import { lookupPlayer, isPlatform } from "@/lib/riot";
import { getRoom, setRoomMembership } from "@/lib/social";

/**
 * Claim-style Riot ID linking: the account asserts ownership of a Riot ID.
 * This is NOT verified ownership — verified linking arrives with Riot Sign On
 * once Riot approves the production application (App 911877). The data model
 * keeps the two states separate (wp_links.verified).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ ok: false, error: "Your account is temporarily restricted." }, { status: 403 });
  const { platform, gameName, tagLine } = (await req.json().catch(() => ({}))) as {
    platform?: string; gameName?: string; tagLine?: string;
  };
  if (!platform || !isPlatform(platform) || !gameName || !tagLine) {
    return NextResponse.json({ ok: false, error: "Give a platform and a full Riot ID (Name#TAG)." }, { status: 400 });
  }
  const result = await lookupPlayer(platform, gameName.trim(), tagLine.trim());
  if (!result.ok) {
    const message = result.code === "not_found" ? "That Riot ID wasn't found on that platform."
      : result.code === "key_unavailable" ? "Player lookup is briefly unavailable (API key rotation)."
      : "Player lookup failed — try again in a moment.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  const player = result.player;
  const existing = await q`SELECT count(*)::int AS n FROM wp_links WHERE user_id = ${user.id}`;
  const isPrimary = Number(existing[0]?.n ?? 0) === 0;
  await q`INSERT INTO wp_links (user_id, puuid, is_primary) VALUES (${user.id}, ${player.puuid}, ${isPrimary})
          ON CONFLICT (user_id, puuid) DO NOTHING`;

  // Auto-join the General room + the player's top-3 champion rooms (brief §4.3).
  const general = await getRoom("general");
  if (general) await setRoomMembership(user.id, general.id, true);
  for (const c of player.snapshot.champPool.slice(0, 3)) {
    const room = await getRoom(`champ-${c.champion.toLowerCase()}`);
    if (room) await setRoomMembership(user.id, room.id, true);
  }
  return NextResponse.json({ ok: true, riotId: `${player.gameName}#${player.tagLine}` });
}
