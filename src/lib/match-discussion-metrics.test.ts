import { afterAll,beforeAll,expect,it,vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import { matchDiscussionMetrics } from "./match-discussion-metrics";

vi.mock("@neondatabase/serverless",async () => ({neon:(await import("../../test/postgres")).neonForTests}));
beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV","development");
  vi.stubEnv("DATABASE_URL","postgresql://fixture.invalid/match-measures");
  vi.stubEnv("PILOT_FIXTURE_EMAILS","configured@metrics.fixture");
  await q`SELECT 1`;
},30_000);
afterAll(async () => {await postgres.close();vi.unstubAllEnvs();});

it("includes unlinked posting authors, excludes staff and test actors, and measures only mature, visible questions",async () => {
  const empty=await matchDiscussionMetrics();
  expect(empty).toMatchObject({postingAuthors:0,firstPost:0,answered:0,medianMinutes:null});
  await postgres.exec(`INSERT INTO wp_users(id,email,display_name) VALUES
    (21,'a@metrics.fixture','A'),(22,'b@metrics.fixture','B'),(23,'c@metrics.fixture','C'),
    (24,'sim@example.org','Test'),(25,'configured@metrics.fixture','QA'),(26,'host@metrics.fixture','Host');
    INSERT INTO wp_pilot_members(user_id,kind,channel,role,joined_at) VALUES
      (26,'host','club',null,now()-interval '14 days'),(23,'participant','club','BOTTOM',now()-interval '14 days');
    INSERT INTO wp_pilot_days(user_id,day_no,social) VALUES(23,7,true);
    INSERT INTO wp_posts(id,author_id,kind,body,status,created_at,card_validated,data)
    SELECT n,uid,'card','Question','visible',now()-age,true,
      jsonb_build_object('matchContext',jsonb_build_object('discussionKind',kind,'queueId',420))
    FROM (VALUES(610,21,'question',interval '5 days'),(611,21,'perspective',interval '2 days'),
      (612,22,'question',interval '4 days'),(613,22,'question',interval '1 hour'),
      (614,24,'question',interval '4 days'),(615,25,'question',interval '4 days'),
      (616,26,'question',interval '4 days')) AS rows(n,uid,kind,age);
    INSERT INTO wp_decisions(post_id,champion,role,topic) SELECT id,'Ashe','BOTTOM','other' FROM wp_posts;
    INSERT INTO wp_posts(author_id,kind,body,status) VALUES(23,'text','Hello','visible');
    INSERT INTO wp_comments(post_id,author_id,body,status,created_at)
    SELECT p.id,v.uid,'Reply','visible',p.created_at+v.delay FROM wp_posts p
    JOIN (VALUES (610,21,interval '1 min'),(610,24,interval '2 min'),(610,23,interval '12 min'),
      (610,22,interval '15 min'),(612,21,interval '25 hours')) v(id,uid,delay) ON v.id=p.id;`);
  expect(await matchDiscussionMetrics()).toEqual({postingAuthors:3,contextualAuthors:2,firstPost:2,repeatPost:2,questions:2,answered:1,medianMinutes:12,returnEligible:1,returned:1});
  await q`UPDATE wp_posts SET withdrawn_at=now() WHERE id=610`;
  expect(await matchDiscussionMetrics()).toMatchObject({repeatPost:1,questions:1,answered:0,medianMinutes:null});
});
