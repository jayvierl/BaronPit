import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/brand";
import { validRating } from "@/lib/match-performance";
import { reviewStandout } from "@/lib/match-review";
import { splitRiotId } from "@/lib/platforms";
import { isPublicMatchQueue } from "@/lib/public-match-queues";
import { isPlatform, lookupPlayer } from "@/lib/riot";

export const dynamic = "force-dynamic";

/** Social preview for a shared match link. The image is produced only for a
 * match in a public queue, and it shows just the reviewed player's champion,
 * result, K/D/A, stored rating and one stored standout — no player names or
 * identities of anyone in the game, including the reviewed player's. Any
 * other request (unknown player, missing match, non-public queue) returns
 * the generic branded card, so an unfurl never leaks or breaks. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const platformParam = url.searchParams.get("platform") ?? "na1";
  const platform = isPlatform(platformParam) ? platformParam : "na1";
  const { gameName, tagLine } = splitRiotId(url.searchParams.get("riotId") ?? "", platform);
  const matchId = url.searchParams.get("match") ?? "";

  let card: { champion: string; win: boolean; kda: string; rating?: string; standout?: string } | null = null;
  if (gameName && tagLine && matchId) {
    const result = await lookupPlayer(platform, gameName, tagLine).catch(() => null);
    if (result?.ok) {
      const matches = result.player.matchHistory?.matches ?? result.player.snapshot.matches;
      const match = matches.find(entry => entry.matchId === matchId);
      if (match && isPublicMatchQueue(match.queueId)) {
        const standout = reviewStandout(match);
        card = {
          champion: match.champion,
          win: match.win,
          kda: `${match.kills} / ${match.deaths} / ${match.assists} K/D/A`,
          ...(validRating(match.performanceRating) ? { rating: `${match.performanceRating.toFixed(1)}/10 rating` } : {}),
          ...(standout ? { standout: `${standout.value} ${standout.label}` } : {}),
        };
      }
    }
  }

  return new ImageResponse(
    card ? (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#181026", color: "#fff", padding: 80, flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 36, color: "#c4b5fd" }}>
          <div style={{ width: 40, height: 40, border: "6px solid #c4b5fd", borderRadius: 12, transform: "rotate(45deg)" }} />
          {APP_NAME} · Match review
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 84, letterSpacing: -2 }}>{card.champion}</div>
          <div style={{ display: "flex", gap: 26, fontSize: 40, color: "#d3cedf" }}>
            <span style={{ color: card.win ? "#c4b5fd" : "#8fa8c8" }}>{card.win ? "Victory" : "Defeat"}</span>
            <span>{card.kda}</span>
            {card.rating && <span>{card.rating}</span>}
          </div>
          {card.standout && <div style={{ fontSize: 44 }}>{card.standout}</div>}
        </div>
        <div style={{ fontSize: 30, color: "#d3cedf" }}>What would you review first? Ask the Pit.</div>
      </div>
    ) : (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#181026", color: "#fff", padding: 80, flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 36, color: "#c4b5fd" }}>
          <div style={{ width: 40, height: 40, border: "6px solid #c4b5fd", borderRadius: 12, transform: "rotate(45deg)" }} />
          {APP_NAME}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 70, letterSpacing: -3 }}>Review your last game.</div>
          <div style={{ fontSize: 33, color: "#d3cedf" }}>Find one play worth another look, then ask the Pit.</div>
        </div>
        <div style={{ height: 7, width: 120, background: "#c4b5fd" }} />
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
