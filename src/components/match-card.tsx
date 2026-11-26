import { MatchQuestionLinks } from "./match-question-links";
import Image from "next/image";
import { ItemIcons } from "./item-icons";
import type { CardItem } from "@/lib/build-catalog";
import type { MatchSummary } from "@/lib/pure";
import { TeamBaronTag } from "./team-baron-tag";

export function MatchCard({ data, patch, itemPatch=patch, itemDetails }: { data: Record<string, unknown>; patch: string; itemPatch?:string; itemDetails?:CardItem[] }) {
  const m = data.match as Pick<MatchSummary, "champion" | "win" | "kills" | "deaths" | "assists" | "cs" | "items" | "teamBaronKills" | "baron"> | undefined;
  if (!m) return <p className="meta">Match details are unavailable for this shared game.</p>;
  return (
    <div className={`match-card ${m.win ? "win" : "loss"}`}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap:"wrap" }}>
        <Image
          unoptimized
          width={36}
          height={36}
          className="champ-icon"
          src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${m.champion}.png`}
          alt=""
        />
        <div style={{ flex: "1 1 120px" }}>
          <span className={m.win ? "win" : "loss"}>{m.win ? "Victory" : "Defeat"}</span>
          <span className="meta">
            {" "}
            · {String(data.riotId ?? "")} on {m.champion}
          </span>
          <div className="kda">
            {m.kills} / {m.deaths} / {m.assists} <span className="meta">· {m.cs} CS</span>
          </div>
          <TeamBaronTag match={m} />
        </div>
        <ItemIcons ids={Array.isArray(m.items) ? m.items : []} patch={itemPatch} details={itemDetails}/>
      </div>
      {typeof data.puuid === "string" && typeof data.matchId === "string" && <MatchQuestionLinks puuid={data.puuid} matchId={data.matchId} items={itemDetails}/>}
    </div>
  );
}
