import { teamBaronLabel, type MatchSummary } from "@/lib/pure";

export function TeamBaronTag({ match }: { match: Pick<MatchSummary, "teamBaronKills" | "baron"> }) {
  const label = teamBaronLabel(match);
  return label ? <span className="chip badge">{label}</span> : null;
}
