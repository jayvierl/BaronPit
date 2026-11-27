import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { expect, it, vi } from "vitest";
import { postgres, testQueries } from "../../test/postgres";
import { q } from "../../src/lib/db";
import { readHomeFeedPage, readComments } from "../../src/lib/post-reader";
import { readFeedCursor } from "../../src/lib/feed-pagination";
import { readQuestionMatch } from "../../src/lib/question-match";
import { matchDiscussionMetrics } from "../../src/lib/match-discussion-metrics";
import { tonightInThePit } from "../../src/lib/tonight-in-the-pit";
import { askDecision } from "../../src/lib/decisions";
import { ensureRooms } from "../../src/lib/rooms";
import type { User } from "../../src/lib/auth";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
vi.mock("../../src/lib/riot", async original => ({
  ...(await original<typeof import("../../src/lib/riot")>()),
  championList: async () => [{ id: "Ashe", name: "Ashe" }],
  championCatalog: async () => ({ patch: "16.23.1", current: true, list: [{ id: "Ashe", name: "Ashe" }] }),
  confirmedPatch: async () => "16.23.1",
}));
vi.mock("../../src/lib/build-catalog", async original => ({
  ...(await original<typeof import("../../src/lib/build-catalog")>()),
  buildCatalog: async () => ({ patch: "16.23.1", items: [], runes: [] }),
}));

// Timestamps span 14 days. The same game appears in ten players' snapshots.
async function seed() {
  await q`SELECT 1`;
  await postgres.exec(`
    INSERT INTO wp_users(id,email,display_name,created_at)
      SELECT i,'u'||i||'@bench.localhost','Player '||i,now()-interval '90 days' FROM generate_series(1,1000) i;
    INSERT INTO wp_rooms(id,slug,name,kind)
      SELECT i,'ranked-fixture-'||i,'Room '||i,'general' FROM generate_series(1001,1020) i;
    INSERT INTO wp_follows(follower_id,followee_id) SELECT 1,i FROM generate_series(2,21) i;
    INSERT INTO wp_room_members(user_id,room_id) VALUES (1,1003),(1,1004);
    INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(10,1);
    INSERT INTO wp_mutes(muter_id,muted_id) VALUES(1,11);
    INSERT INTO wp_players(puuid,platform,game_name,tag_line,snapshot)
      SELECT 'bench-'||i,'na1','Player '||i,'NA1',jsonb_build_object('matches',jsonb_agg(
        jsonb_build_object('matchId','NA1_'||(100000+(i-1)/10*20+slot),'queueId',420,'champion','Ashe',
          'role','BOTTOM','win',i%2=0,'playedAt',floor(extract(epoch from now()-slot*interval '1 hour')*1000),
          'durationSec',1800,'kills',3,'deaths',2,'assists',9,'cs',160,'gamePatch','16.23','items','[3006]'::jsonb)
        ORDER BY slot))
      FROM generate_series(1,1000) i CROSS JOIN generate_series(1,20) slot GROUP BY i;
    INSERT INTO wp_links(user_id,puuid,verified) SELECT i,'bench-'||i,true FROM generate_series(1,500) i;
    INSERT INTO wp_posts(id, author_id, room_id, kind, status, body, data, card_validated, created_at)
      SELECT i,1+(i-1)%1000,1001+((i-1)/9)%20,CASE WHEN i%20=0 THEN 'card' WHEN i%25=0 THEN 'poll' ELSE 'text' END,
        CASE WHEN i%40=1 THEN 'held' ELSE 'visible' END,'When is it worth staying for the next wave? '||i,
        CASE WHEN i%20=0 THEN jsonb_build_object('matchId','NA1_100001','platform','na1','riotId','Player 1#NA1',
          'match',jsonb_build_object('champion','Ashe','win',true,'kills',3,'deaths',2,'assists',9,'cs',160,'items','[]'::jsonb),
          'matchContext',jsonb_build_object('platform','na1','riotId','Player 1#NA1','matchId','NA1_100001',
          'queueId',420,'champion','Ashe','win',true,'kills',3,'deaths',2,'assists',9,'cs',160,'playedAt',1580000000000,
          'durationSec',1800,'sourceUpdatedAt','2020-02-01T00:00:00Z','authorRole','spectator','discussionKind','question'))
          WHEN i%25=0 THEN '{"options":["Hold wave","Recall"]}'::jsonb ELSE '{}'::jsonb END,i%20=0,
        now()-((10000-i)*interval '2 minutes' + interval '4 hours') FROM generate_series(1,10000) i;
    INSERT INTO wp_decisions(post_id, champion,role,topic) SELECT id,'Ashe','Bot','Laning' FROM wp_posts WHERE kind='card';
    INSERT INTO wp_comments(id,post_id,author_id,parent_id,status,body,created_at)
      SELECT i+(s-1)*10000,i,1+(i+s)%1000,CASE WHEN s=3 THEN i END,CASE WHEN (i+s)%70=0 THEN 'held' ELSE 'visible' END,
        'Check the wave before recalling; there is time to ward.',p.created_at+s*interval '30 minutes'
      FROM wp_posts p CROSS JOIN generate_series(1,3) s CROSS JOIN LATERAL (SELECT p.id AS i) n;
    INSERT INTO wp_reactions(user_id,target_kind,target_id,emoji)
      SELECT 1+i%1000,'post',i,'gg' FROM generate_series(1,10000,2) i;
    INSERT INTO wp_reposts(user_id,post_id,first_shared_at) SELECT 2,id,created_at+interval '2 hours'
      FROM wp_posts WHERE id%100=0;
    SELECT setval(pg_get_serial_sequence('wp_posts','id'),10000);
    ANALYZE;
  `);
  await ensureRooms();
}

type Measurement = { operation: string; queries: number; rows: number; jsonBytes: number; p50ms: number; p95ms: number };
async function measure<T>(operation: string, run: () => Promise<T>, cardinality: (result: T) => number) {
  await run();
  const durations: number[] = [];
  let queries = 0, rows = 0, jsonBytes = 0;
  for (let sample = 0; sample < 10; sample++) {
    testQueries.length = 0;
    const start = performance.now();
    const data = await run();
    durations.push(performance.now() - start);
    queries = testQueries.length;
    rows = cardinality(data);
    jsonBytes = Buffer.byteLength(JSON.stringify(data));
  }
  durations.sort((a,b) => a-b);
  return { operation, queries, rows, jsonBytes, p50ms: Math.round(durations[4]), p95ms: Math.round(durations[9]) };
}

it("measures the production discussion queries using a private in-memory PostgreSQL fixture", async () => {
  vi.stubEnv("VERCEL_ENV","development");
  vi.stubEnv("DATABASE_URL","postgresql://fixture.invalid");
  const outbound = vi.fn(() => { throw new Error("Unexpected external request"); });
  vi.stubGlobal("fetch",outbound);
  try {
    await seed();
    const viewer: User = { id:1,email:"u1@bench.localhost",displayName:"Player 1",avatarHue:1,bio:"",createdAt:"2020-01-01",bannedUntil:null,strikeCount:0,ageBand:"adult",termsCurrent:true };
    const ref = { platform:"na1",riotId:"Player 1#NA1",matchId:"NA1_100001" };
    const now = Date.now();
    if (process.env.CAPACITY_PLAN === "tonight") {
      const recorder = vi.spyOn(postgres,"query");
      await tonightInThePit(viewer.id,now);
      const recorded = recorder.mock.calls.find(([text])=>text.includes("wp_players"));
      recorder.mockRestore();
      if (!recorded) throw new Error("Missing summary query");
      const plan = await postgres.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+recorded[0],recorded[1]);
      console.log(JSON.stringify(plan.rows));
      return;
    }
    const measurements: Measurement[] = [];
    for (const tab of ["everyone","following"] as const) {
      const first = await readHomeFeedPage(viewer.id,tab,null,now);
      const cursor = readFeedCursor(first.next,tab,now+100);
      expect(cursor).not.toBeNull();
      const second = await readHomeFeedPage(viewer.id,tab,cursor,now);
      expect(new Set([...first.posts,...second.posts].map(row=>row.id)).size).toBe(60);
      expect([...first.posts,...second.posts].every(p=>p.authorId!==10 && p.authorId!==11 && p.status==="visible")).toBe(true);
      for(const [page,before] of [[1,null],[2,cursor]] as const)
        measurements.push(await measure(tab+" page "+page,()=>readHomeFeedPage(viewer.id,tab,before,now),v=>v.posts.length));
    }
    const card = await readQuestionMatch(ref,viewer.id);
    expect(card?.authorRole).toBe("player");
    measurements.push(await measure("match preview",()=>readQuestionMatch(ref,viewer.id),v=>Number(v!==null)));
    measurements.push(await measure("discussion comments",()=>readComments(10000,viewer.id),v=>v.reduce((n,c)=>n+1+c.replies.length,0)));
    measurements.push(await measure("Tonight summary",()=>tonightInThePit(viewer.id,now),()=>1));
    measurements.push(await measure("internal pilot metrics",()=>matchDiscussionMetrics(),()=>1));
    const draft = {...ref, champion:"Ashe", role:"Bot",topic:"Laning",body:"Should we have frozen this wave before recalling?",confirmPublicMatch:true,submissionId:randomUUID()};
    testQueries.length=0;
    const createStart=performance.now();
    const published=await askDecision(viewer,draft);
    const createMs=Math.round(performance.now()-createStart), createQueries=testQueries.length;
    expect(published.ok).toBe(true);
    measurements.push(await measure("same-key post retry",()=>askDecision(viewer,draft),v=>Number(v.ok)));
    testQueries.length=0;
    const burstStart=performance.now();
    const burst=await Promise.all(Array.from({length:8},(_,i)=>readHomeFeedPage(i+1,i%2?"following":"everyone",null,now)));
    const feedBurst={ callers:burst.length, queries:testQueries.length, ms:Math.round(performance.now()-burstStart) };
    const racingDraft={ ...draft,body:"Was it better to recall before the next wave reached the river?",submissionId:randomUUID() };
    const racers=await Promise.all(Array.from({length:4},()=>askDecision(viewer,racingDraft)));
    expect(racers.every(result=>result.ok)).toBe(true);
    expect(new Set(racers.map(result=>result.ok ? result.postId : null)).size).toBe(1);
    const raceCount=await q`SELECT count(*)::int n FROM wp_posts WHERE body=${racingDraft.body}`;
    expect(raceCount[0].n).toBe(1);
    const counts = await q`SELECT count(*)::int n FROM wp_posts WHERE body=${draft.body}`;
    expect(counts[0].n).toBe(1);
    expect(outbound).not.toHaveBeenCalled();
    const size=await postgres.query<{bytes:string}>(`SELECT sum(pg_total_relation_size(oid))::text bytes FROM pg_class WHERE relkind='r' AND relname LIKE 'wp_%'`);
    console.log(JSON.stringify({ source:"PGlite synthetic fixture", seedPosts:10000, users:1000, replies:30000, snapshots:1000, pageOverlap:0, rowsForReplayedPost:counts[0].n,
      feedBurst, concurrentSubmitters:racers.length, rowsForConcurrentPost:raceCount[0].n, instanceRelationBytes:Number(size.rows[0].bytes), externalCalls:outbound.mock.calls.length, initialPublication:{queries:createQueries,ms:createMs}, measurements},null,2));
  } finally {await postgres.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs();}
});
