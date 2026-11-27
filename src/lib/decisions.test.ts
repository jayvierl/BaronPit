import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { decisionSchema } from "./decision-schema";
import {
  askDecision,
  acceptDecision,
  decisions,
  recordTrial,
  trialOptions,
  setQuestionPreference,
  questionPreference,
  myDecisionProgress,
  profileMatchDiscussions,
} from "./decisions";
import { q } from "./db";
import type { User } from "./auth";
import { addComment, getPost } from "./social";
import { readQuestionMatch } from "./question-match";
import { discussionMetadata } from "./discussion-library-preview";

vi.mock("@neondatabase/serverless", async () => ({
  neon: (await import("../../test/postgres")).neonForTests,
}));
vi.mock("./riot", async (original) => ({
  ...(await original<typeof import("./riot")>()),
  confirmedPatch: async () => "16.23.1",
  championList: async () => [
    { id: "Ashe", name: "Ashe" },
    { id: "Caitlyn", name: "Caitlyn" },
  ],
  championCatalog: async () => ({ patch: "16.23.1", current: true, list: [{ id: "Ashe", name: "Ashe" }] }),
}));
const owner: User = {
  id: 1,
  email: "x@fixture.invalid",
  displayName: "Asker",
  avatarHue: 3,
  bio: "",
  createdAt: "2024-01-01",
  bannedUntil: null,
  strikeCount: 0,
  ageBand: "adult",
  termsCurrent: true,
};
let question = 0,
  answer = 0;
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/questions");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`SELECT 1`;
  for (const ddl of decisionSchema) await postgres.exec(ddl);
  await postgres.exec(`INSERT INTO wp_users(id,email,display_name) VALUES(1,'a@fixture.invalid','Asker'),(2,'b@fixture.invalid','Helper'),(3,'c@fixture.invalid','Reader'),(4,'d@fixture.invalid','New');
    INSERT INTO wp_players(puuid,platform,game_name,tag_line,snapshot) VALUES('player','na1','Sample','NA1','{"matches":[]}');
    INSERT INTO wp_links(user_id,puuid,verified) VALUES(1,'player',false);`);
}, 30000);
afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});
describe("moderated decision questions", () => {
  it("validates the context, atomically asks in the champion room, holds new accounts, and rejects forged game cards", async () => {
    const draft = {
      body: "Where should I set up before the second dragon?",
      champion: "Ashe",
      opponent: "Caitlyn",
      role: "Bot",
      topic: "Objective",
    };
    expect((await askDecision(owner, { ...draft, champion: "nobody" })).ok).toBe(false);
    expect((await askDecision(owner, { ...draft, puuid: "player", matchId: "invented" })).ok).toBe(false);
    const posted = await askDecision(owner, draft);
    expect(posted).toMatchObject({ ok: true, status: "visible" });
    if (!posted.ok) throw Error("fixture unavailable");
    question = posted.postId;
    expect(
      await decisions(null, { mode: "unanswered", opponent: "Caitlyn", role: "Bot", patch: "16.23", topic: "Objective" }),
    ).toMatchObject([{ postId: question, champion: "Ashe", answer: null }]);
    const held = await askDecision({ ...owner, id: 4, createdAt: new Date().toISOString() }, draft);
    expect(held).toMatchObject({ ok: true, status: "held" });
    expect(await decisions(null)).toHaveLength(1);
    expect(await decisions(null, { topic: "Objective" })).toMatchObject([{ postId: question }]);
    expect(await decisions(null, { topic: "Laning" })).toEqual([]);
  });
  it("saves and clears a private responder queue, including after a return and a scope change", async () => {
    expect(await questionPreference(2)).toBeNull();
    expect(await decisions(2, { mode: "mine" })).toEqual([]);
    expect(await setQuestionPreference(2, { role: "Bot", champion: "invented" })).toBe(false);
    expect(await setQuestionPreference(2, { role: "Bot", champion: "Ashe" })).toBe(true);
    expect(await questionPreference(2)).toEqual({ role: "Bot", champion: "Ashe" });
    expect(await decisions(2, { mode: "mine" })).toMatchObject([{ postId: question }]);
    expect(await decisions(3, { mode: "mine" })).toEqual([]);
    await q`UPDATE wp_posts SET replies_closed=true WHERE id=${question}`;
    expect(await decisions(null, { mode: "unanswered", postId: question })).toEqual([]);
    expect(await decisions(2, { mode: "mine" })).toEqual([]);
    expect(await decisions(null, { postId: question })).toMatchObject([{ postId: question }]);
    await q`UPDATE wp_posts SET replies_closed=false WHERE id=${question}`;
    expect(await decisions(2, { mode: "mine" })).toMatchObject([{ postId: question }]);
    await setQuestionPreference(2, { role: "Mid" });
    expect(await questionPreference(2)).toEqual({ role: "Mid", champion: null });
    expect(await decisions(2, { mode: "mine" })).toEqual([]);
    expect(await setQuestionPreference(2, { clear: true })).toBe(true);
    expect(await questionPreference(2)).toBeNull();
  });
  it("retains only an actual inventory item and its catalog name on the submitted game decision", async () => {
    const match = {
      matchId: "NA1_101",
      gamePatch: "16.22",
      champion: "Ashe",
      items: [3031],
      durationSec: 1900,
      role: "BOTTOM",
      queueId: 420,
      win: true,
      kills: 4,
      deaths: 2,
      assists: 11,
      cs: 186,
      playedAt: Date.now() - 1000,
    };
    await q`UPDATE wp_players SET fetched_at=now(), snapshot=${JSON.stringify({ matches: [match] })}::jsonb WHERE puuid='player'`;
    const draft = {
      body: "Was this item right before dragon?",
      champion: "Ashe",
      role: "Bot",
      topic: "Laning",
      puuid: "player",
      matchId: "NA1_101",
      confirmPublicMatch: true,
      itemId: 3031,
      itemName: "Invented item name",
      patch: "26.99",
    };
    expect((await askDecision(owner, { ...draft, itemId: 3006 })).ok).toBe(false);
    const result = await askDecision(owner, draft);
    if (!result.ok) throw Error(result.error);
    expect(await decisions(null, { postId: result.postId })).toMatchObject([
      { topic: "Build choice", patch: "26.22", itemId: 3031, itemName: "Infinity Edge" },
    ]);
    expect(await decisions(null, { mode: "unanswered", topic: "Build choice" })).toMatchObject([{ postId: result.postId }]);
    await q`DELETE FROM wp_posts WHERE id=${result.postId}`;
    const legacy = { ...match, gamePatch: undefined };
    await q`UPDATE wp_players SET snapshot=${JSON.stringify({ matches: [legacy] })}::jsonb WHERE puuid='player'`;
    const oldResult = await askDecision(owner, draft);
    if (!oldResult.ok) throw Error(oldResult.error);
    expect(await decisions(null, { postId: oldResult.postId })).toMatchObject([{ patch: null }]);
    await q`DELETE FROM wp_posts WHERE id=${oldResult.postId}`;
  });
  it("only the asker can select another player's published reply on this question", async () => {
    const posted = await addComment(
      { ...owner, id: 2 },
      question,
      "Push the wave first if your support can cover the river.",
    );
    if (!posted.ok) throw Error("missing reply");
    answer = posted.postId;
    await setQuestionPreference(3, { role: "Bot" });
    expect(await decisions(3, { mode: "mine" })).toEqual([]);
    await setQuestionPreference(3, { clear: true });
    const self = await addComment(owner, question, "Thank you for looking!");
    expect(await acceptDecision(3, question, answer)).toBe(false);
    expect(await acceptDecision(1, question, self.ok ? self.postId : 0)).toBe(false);
    expect(await acceptDecision(1, question, answer)).toBe(true);
    expect((await myDecisionProgress(1,null,true)).entries).toMatchObject([{postId:question,answer:{id:answer},outcome:null}]);
    expect((await myDecisionProgress(1,question,true)).entries).toEqual([]);
    expect((await myDecisionProgress(2,null,false)).entries).toEqual([]);
    expect(
      await decisions(null, { mode: "answered", q: "cover the river", opponent: "Caitlyn", topic: "Objective" }),
    ).toMatchObject([{ answer: { id: answer, name: "Helper" } }]);
    expect(await decisions(null, { mode: "unanswered" })).toEqual([]);
    await q`INSERT INTO wp_mutes(muter_id,muted_id) VALUES (3,2)`;
    expect(await decisions(3, { mode: "answered" })).toEqual([]);
    expect(await decisions(3, { mode: "answered", topic: "Objective" })).toEqual([]);
    expect(await decisions(3, { q: "cover the river" })).toEqual([]);
  });
  it("lets an unlinked spectator attach recent public evidence without claiming ownership or duplicating retries", async () => {
    const playedAt = Date.now() - 60_000;
    const match = { matchId:"NA1_8871",champion:"Ashe",opponentChampion:"Caitlyn",gamePatch:"16.22",queueId:420,
      playedAt, durationSec:1900,win:true,kills:4,deaths:2,assists:11,cs:186,role:"BOTTOM",items:[3031],
      teams:{allies:[{name:"omit roster"}]} };
    const proof = { platform:"na1",riotId:"Target Name#LAB",matchId:match.matchId };
    const hidden = { ...proof, matchId:"NA1_8872" };
    const aram = { ...proof, matchId:"NA1_8873" };
    await q`INSERT INTO wp_users(id,email,display_name) VALUES(5,'source@example.test','Match Owner')`;
    await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line,snapshot)
      VALUES('private-source-key','na1','Target Name','LAB',${JSON.stringify({matches:[{...match,matchId:hidden.matchId,queueId:0}],
        olderMatches:[match,{...match,matchId:aram.matchId,queueId:450}]})}::jsonb)`;
    await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES(5,'private-source-key',true)`;
    expect(await readQuestionMatch(proof,3)).toMatchObject({ authorRole:"spectator",queueId:420,region:"na1",patch:"26.22",items:[3031],
      matchHref:"/player?platform=na1&riotId=Target+Name%23LAB&match=NA1_8871#match-NA1_8871" });
    expect(await readQuestionMatch(proof,5)).toMatchObject({ authorRole:"player" });
    expect(await readQuestionMatch(hidden,5)).toBeNull();
    expect(await readQuestionMatch(aram,3)).toMatchObject({ role:"TEAM", queueId:450 });
    expect(await readQuestionMatch({...proof,platform:"euw1"},3)).toBeNull();
    const reader = {...owner,id:3};
    const draft = { ...proof, body:"Would Ashe save the cooldown for the next dragon?",champion:"Ashe",role:"Bot",topic:"Objective",
      discussionKind:"perspective", submissionId:"ebdf20ac-2040-4918-b988-997dca4affbd",authorRole:"player",queueId:0,patch:"99.99",
      matchContext:{ kills:7000, riotId:"Forged" } };
    expect(await askDecision(reader,draft)).toMatchObject({ok:false,error:expect.stringContaining("public before posting")});
    expect(await askDecision(reader,{...draft,confirmPublicMatch:true,champion:"Caitlyn"})).toMatchObject({ok:false});
    const result = await askDecision(reader,{...draft, confirmPublicMatch:true});
    if (!result.ok) throw Error(result.error);
    const { postId } = result;
    try {
      const post = await getPost(postId,null);
      expect(post).toMatchObject({ authorId:3,isQuestion:false,roomSlug:"champ-ashe",data:{matchContext:{authorRole:"spectator",discussionKind:"perspective",
        patch:"26.22",queueId:420,kills:4}} });
      expect(JSON.stringify(post)).not.toMatch(/private-source-key|Forged|omit roster|7000/);
      expect(await decisions(null,{postId})).toMatchObject([{matchContext:{authorRole:"spectator",discussionKind:"perspective"}}]);
      expect((await profileMatchDiscussions(3,null,null)).entries).toMatchObject([{postId,matchContext:{discussionKind:"perspective"}}]);
      expect((await profileMatchDiscussions(1,null,null)).entries).toEqual([]);
      expect((await profileMatchDiscussions(3,null,postId)).entries).toEqual([]);
      expect((await myDecisionProgress(3,null,false)).entries).toEqual([]);
      const neutral = await askDecision(reader,{ ...aram,body:"Should the team reset before this fight?",champion:"Ashe",topic:"Teamfight",confirmPublicMatch:true });
      expect(neutral.ok).toBe(true);
      if(neutral.ok) {
        expect(await decisions(null,{postId:neutral.postId})).toMatchObject([{role:"Team",matchContext:{role:"TEAM"}}]);
        await q`DELETE FROM wp_posts WHERE id=${neutral.postId}`;
      }
      expect(await askDecision(reader,{body:"How can I play the next teamfight?",champion:"Ashe",role:"Team",topic:"Teamfight"})).toMatchObject({ok:false});
      expect(await decisions(null,{postId,mode:"unanswered"})).toEqual([]);
      const reply = await addComment({...owner,id:1},postId,"That depends on how the wave pushes.");
      expect(reply.ok).toBe(true);
      if (reply.ok) {
        expect(await acceptDecision(3,postId,reply.postId)).toBe(false);
        expect(await recordTrial(3,postId,reply.postId,"helped",null)).toBe(false);
      }
      expect((await discussionMetadata(String(postId))).title).toContain("perspective");
      await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (5,2)`;
      expect(await readQuestionMatch(proof,2)).toBeNull();
      expect(await getPost(postId,{...owner,id:2})).toBeNull();
      expect(await decisions(2,{postId})).toEqual([]);
      expect((await profileMatchDiscussions(3,2,null)).entries).toEqual([]);
      expect((await discussionMetadata(String(postId),2)).openGraph).toBeUndefined();
      await q`UPDATE wp_players SET fetched_at=now()-interval '25 hours',snapshot='{}'::jsonb WHERE puuid='private-source-key'`;
      expect(await readQuestionMatch(proof,3)).toBeNull();
      expect(await askDecision(reader,{...draft,confirmPublicMatch:true})).toMatchObject({ok:true,postId});
      expect(await getPost(postId,null)).toMatchObject({body:draft.body,data:{matchContext:{matchId:match.matchId}}});
    } finally {
      await q`DELETE FROM wp_posts WHERE id=${postId}`;
    }
  });
  it("verifies game ownership and time for optional evidence, preserves a chosen result, and suppresses hidden answers", async () => {
    await q`UPDATE wp_decisions SET accepted_at=now()-interval '10 minutes' WHERE post_id=${question}`;
    const matches = [
      {
        matchId: "later",
        champion: "Ashe",
        playedAt: Date.now() - 1000,
        queueId: 420,
        win: true,
        kills: 3,
        deaths: 2,
        assists: 10,
      },
      {
        matchId: "earlier",
        champion: "Ashe",
        playedAt: Date.now() - 3600000,
        queueId: 420,
        win: false,
        kills: 0,
        deaths: 2,
        assists: 1,
      },
    ];
    await q`UPDATE wp_players SET fetched_at=now(),snapshot=${JSON.stringify({ matches })}::jsonb WHERE puuid='player'`;
    expect(await trialOptions(1, question)).toEqual([]);
    expect(await recordTrial(2, question, answer, "helped", null)).toBe(false);
    expect(await recordTrial(1, question, answer, "mixed", "later")).toBe(false);
    expect(await recordTrial(1, question, answer, "mixed", null)).toBe(true);
    await q`UPDATE wp_links SET verified=true WHERE user_id=1`;
    await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES(2,'player',true)`;
    expect(await trialOptions(1, question)).toEqual([]);
    expect(await recordTrial(1, question, answer, "helped", "later")).toBe(false);
    await q`DELETE FROM wp_links WHERE user_id=2 AND puuid='player'`;
    expect((await trialOptions(1, question)).map((m) => m.matchId)).toEqual(["later"]);
    expect(await recordTrial(1, question, answer, "helped", "earlier")).toBe(false);
    expect(await recordTrial(1, question, answer, "helped", "later")).toBe(true);
    await q`UPDATE wp_players SET snapshot='{"matches":[]}'::jsonb WHERE puuid='player'`;
    expect(await recordTrial(1, question, answer, "still-testing", "later")).toBe(true);
    expect(await decisions(null, { postId: question })).toMatchObject([
      { outcome: "still-testing", trialMatch: { matchId: "later" } },
    ]);
    expect((await myDecisionProgress(1,null,true)).entries).toEqual([]);
    expect((await myDecisionProgress(1,null,false)).entries).toMatchObject([{postId:question,outcome:"still-testing"}]);
    // Withdrawal can retain a protected reply body for moderators while keeping its status column.
    await q`UPDATE wp_comments SET withdrawn_at=now() WHERE id=${answer}`;
    expect(await decisions(null, { postId: question })).toMatchObject([{answer:null,outcome:null,trialMatch:null}]);
    expect((await myDecisionProgress(1,null,false)).entries).toMatchObject([{postId:question,answer:null,outcome:null}]);
    expect(await acceptDecision(1,question,answer)).toBe(false);
    expect(await recordTrial(1,question,answer,"helped",null)).toBe(false);
    await q`UPDATE wp_comments SET status='held' WHERE id=${answer}`;
    expect(await decisions(null, { postId: question })).toMatchObject([
      { answer: null, trialMatch: null, outcome: null },
    ]);
    expect(await recordTrial(1, question, answer, "helped", null)).toBe(false);
    await q`UPDATE wp_rooms SET safety_status='held' WHERE slug='champ-ashe'`;
    expect(await decisions(null)).toEqual([]);
  });
});
