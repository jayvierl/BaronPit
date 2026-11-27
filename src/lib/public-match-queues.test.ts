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

it("preserves full retrieval coverage while excluding unsupported games from the visible sample", () => {
  const base = {queueId:420,matchId:"EUW1_123",champion:"Nami",win:true,kills:1,deaths:2,assists:9,cs:20,
    durationSec:1250,playedAt:45000};
  const matches = [{...base,queueId:0,matchId:"EUW1_42"},base];
  const olderMatches = [{...base,queueId:9999,matchId:"EUW1_32"}];
  const p = playerFromRow({snapshot:{matches,olderMatches,historyComplete:true}});
  expect(p.matchHistory?.matches).toMatchObject([{matchId:base.matchId}]);
  expect(p.matchHistory?.complete).toBe(true);
  expect(playerFromRow({snapshot:{matches,olderMatches:[{...olderMatches[0],queueId:"invalid"}],historyComplete:true}})
    .matchHistory?.complete).toBe(false);
});
