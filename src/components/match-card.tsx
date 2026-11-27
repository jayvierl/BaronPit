import { MatchQuestionLinks } from "./match-question-links";
import Image from "next/image";
import { ItemIcons } from "./item-icons";
import { GameCardArt } from "./game-card-art";
import type { CardItem } from "@/lib/build-catalog";
import { gameCardMotion } from "@/lib/game-card-motion";
import { cardQuestionMatch } from "@/lib/decisions-input";
import { isPublicMatchQueue } from "@/lib/public-match-queues";
import type { MatchSummary } from "@/lib/pure";
import { TeamBaronTag } from "./team-baron-tag";

export function MatchCard({ data, patch, itemPatch=patch, itemDetails }: { data: Record<string, unknown>; patch: string; itemPatch?:string; itemDetails?:CardItem[] }) {
  const m = data.match as Pick<MatchSummary, "champion" | "win" | "kills" | "deaths" | "assists" | "cs" | "items" | "queueId" | "teamBaronKills" | "baron"> | undefined;
  if (!m || typeof m.win !== "boolean") return <p className="meta">Match details are unavailable for this shared game.</p>;
  const question = isPublicMatchQueue(m.queueId) ? cardQuestionMatch(data) : null;
  return (
    <div className={`match-card ${m.win ? "win" : "loss"}`}>
      <GameCardArt motion={gameCardMotion(m.win)} />
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
      {question && <MatchQuestionLinks match={question} items={itemDetails}/>}
    </div>
  );
}
