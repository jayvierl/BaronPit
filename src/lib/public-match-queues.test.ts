import { expect,it } from "vitest";
import { playerFromRow } from "./riot";

it("excludes custom and unknown games from both history windows, totals, highlights and champion roles",()=>{
  const base={queueId:420,matchId:"NA1_123",champion:"Nami",win:true,kills:1,deaths:2,assists:9,cs:20,role:"UTILITY",durationSec:1250,playedAt:45000};
  const privateGame={...base,queueId:0,matchId:"NA1_42",champion:"Garen",role:"TOP"};
  const unknown={...base,queueId:900000,matchId:"NA1_88"};
  const p=playerFromRow({snapshot:{matches:[privateGame,base],olderMatches:[unknown,base],historyComplete:true,
    games:2,wins:2,champPool:[{champion:"Garen",games:10}]}});
  expect(p.snapshot.matches.map(x=>x.matchId)).toEqual([base.matchId]);
  expect(p.matchHistory?.matches).toEqual(p.snapshot.matches);
  expect(p.snapshot.roles).toEqual({UTILITY:1});
  expect(p.snapshot.champPool.map(c=>c.champion)).toEqual(["Nami"]);
  expect(p.snapshot.games).toBe(1);
  expect(p.matchHistory?.complete).toBe(false);
});
