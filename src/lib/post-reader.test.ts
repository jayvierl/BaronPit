import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { postgres, testQueries } from "../../test/postgres";
import { q } from "./db";
import { setRoomMembership } from "./rooms";
import type { User } from "./auth";
import { addComment, buildFeed, feed, feedByAuthor, getPost, listComments, reconfirmBuild, toggleReaction, votePoll } from "./social";
import { linkedPlayers, publicProfile, publicRiotOwner } from "./player-insights";
import { publicAvatarIdentity } from "./author-identity";
import { BARON_CALL_OPTIONS } from "./poll";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
vi.mock("./riot", async importOriginal => ({ ...await importOriginal<typeof import("./riot")>(), confirmedPatch: async () => "16.23.1" }));

const viewer: User = { id: 1, email: "viewer@example.invalid", displayName: "Viewer", avatarHue: 1, createdAt: "2025-01-01", bio: "", bannedUntil: null, strikeCount: 0, ageBand: "adult", termsCurrent: true };
const own = { ...viewer, id: 2 };
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/social");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`SELECT 1`;
  await postgres.exec(`
    INSERT INTO wp_users(id,email,display_name,avatar_hue) VALUES
      (1,'1@fixtures.invalid','Viewer',31),(2,'2@fixtures.invalid','Main',22),(3,'3@fixtures.invalid','Blocked',33),
      (4,'4@fixtures.invalid','Blocked viewer',44),(5,'5@fixtures.invalid','Muted',55);
    INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,rank_div,snapshot)
      VALUES ('ref','na1','Player','NA1','GOLD','IV','{"champPool":[{"champion":"Ashe"}],"matches":[{"queueId":420,"champion":"Ashe"}]}');
    INSERT INTO wp_links(user_id,puuid,is_primary,verified) VALUES (2,'ref',true,true);
    INSERT INTO wp_rooms(id,slug,name,kind) VALUES (1,'general','General','general');
    INSERT INTO wp_blocks VALUES (1,3,now()),(4,1,now());
    INSERT INTO wp_mutes VALUES (1,5,now());
    INSERT INTO wp_posts(id,author_id,kind,body,status,room_id,data) VALUES
      (11,2,'build','first','visible',1,'{"champion":"Ashe","offMeta":true,"items":[1001],"patch":"16.22.1","keystone":{"id":8465,"name":"Guardian"}}'),
      (12,2,'poll','question','visible',1,'{"options":["A","B"]}'),
      (13,2,'card','game','visible',1,'{}'), (14,2,'text','held','held',1,'{}'),
      (15,3,'text','blocked','visible',1,'{}'), (16,4,'text','reverse','visible',1,'{}'),
      (17,5,'text','muted','visible',1,'{}'), (18,2,'clip','legacy clip','visible',1,'{}'),
      (19,2,'media','legacy upload','visible',1,'{}'), (20,2,'text','removed','removed',1,'{}');
    INSERT INTO wp_comments(id,post_id,author_id,parent_id,body,status) VALUES
      (101,13,2,null,'root','visible'),(102,13,2,101,'reply','visible'),(103,13,2,102,'older nested reply','visible'),
      (104,13,3,null,'blocked root','visible'),(105,13,2,104,'under block','visible'),
      (106,13,2,null,'held root','held'),(107,13,2,106,'under hold','visible'),
      (108,14,2,null,'held post','visible'),(109,15,2,null,'blocked post','visible');
    INSERT INTO wp_poll_votes(post_id,user_id,option_idx) VALUES (12,2,0),(12,1,1);
    INSERT INTO wp_reactions(user_id,target_kind,target_id,emoji) VALUES (1,'post',12,'GG'),(3,'post',12,'GG');
    INSERT INTO wp_follows(follower_id,followee_id) VALUES (1,2);
  `);
}, 30000);
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

describe("feed and conversation read contracts", () => {
  it("updates existing posts, nested replies and the public profile from the author's current avatar", async () => {
    const champion = {kind: "champion", id: "Nami"} as const;
    const current = async () => [
      (await getPost(13,null))?.authorAvatar,
      (await listComments(13,null))[0].replies[0].authorAvatar,
      (await publicProfile(2,null,"2026-11-26"))?.avatar,
    ];
    const initials = {kind:"initials"};
    expect(await current()).toEqual([initials,initials,initials]);
    await q`UPDATE wp_users SET avatar_ref=${JSON.stringify(champion)}::jsonb WHERE id=2`;
    try {
      expect(await current()).toEqual([champion,champion,champion]);
      const photo = {kind:"upload", id:"73dc486f-b034-456b-bc88-14c71c102245", hash:"a1".repeat(32)};
      await q`UPDATE wp_users SET avatar_ref=${JSON.stringify(photo)}::jsonb WHERE id=2`;
      expect(await current()).toEqual([photo,photo,photo]);
      const signedIn = {...own, avatar:champion};
      expect(publicAvatarIdentity(signedIn)).toEqual({name:signedIn.displayName,hue:signedIn.avatarHue,avatar:champion});
      expect(publicAvatarIdentity(null)).toBeNull();
      await q`UPDATE wp_users SET avatar_ref=NULL WHERE id=2`;
      expect(await current()).toEqual([initials,initials,initials]);
    } finally {
      await q`UPDATE wp_users SET avatar_ref=NULL WHERE id=2`;
    }
  });

  it("returns consistent scoped cards with flair, counts and the viewer’s votes in four queries", async () => {
    testQueries.length = 0;
    const rows = await feed(viewer, "following");
    expect(testQueries).toHaveLength(4);
    expect(rows.map(p => p.id)).toEqual([13,12,11]);
    expect(rows[0].commentCount).toBe(3);
    expect(rows[1]).toMatchObject({authorName:"Main",authorFlair:"Gold IV · Ashe main",authorStatsHref:"/player?platform=na1&riotId=Player%23NA1",roomSlug:"general",
      pollResults:[1,1],myVote:1,reactions:{GG:1},myReactions:["GG"]});
    expect((await feedByAuthor(2, viewer)).find(p=>p.id===12)).toEqual(rows[1]);
    expect(await getPost(12,viewer)).toEqual(rows[1]);
    expect((await feed(viewer,"everyone",1,1)).map(p=>p.id)).toEqual([13]);
    expect(await feedByAuthor(3,viewer)).toEqual([]);
    expect(await publicProfile(4,1,"2026-11-26")).toBeNull();
    expect(await publicProfile(5,1,"2026-11-26")).toMatchObject({id:5});
  });
  it("hides moderated profile names from posts, replies and public Riot owner links, then restores them on release", async () => {
    await q`INSERT INTO wp_comments(id,post_id,author_id,body) VALUES(600,15,2,'Earlier reply')`;
    try {
      expect(await publicRiotOwner("ref",null)).toEqual({id:2,name:"Main"});
      expect((await listComments(15,null)).map(c=>c.id)).toContain(600);
      await q`UPDATE wp_users SET safety_status='held' WHERE id=2`;
      expect(await publicRiotOwner("ref",null)).toBeNull();
      expect((await feed(null,"everyone")).map(p=>p.authorId)).not.toContain(2);
      expect(await getPost(12,null)).toBeNull();
      expect(await listComments(15,null)).toEqual([]);
      await q`UPDATE wp_users SET safety_status='visible',banned_until=now()+interval '1 hour' WHERE id=2`;
      expect(await getPost(12,null)).toBeNull();
      await q`UPDATE wp_users SET banned_until=now()-interval '1 second' WHERE id=2`;
      expect((await getPost(12,null))?.authorName).toBe("Main");
      expect((await listComments(15,null)).map(c=>c.id)).toContain(600);
    } finally {
      await q`UPDATE wp_users SET safety_status='visible',banned_until=null WHERE id=2`;
      await q`DELETE FROM wp_comments WHERE id=600`;
    }
  });
  it("reserves author flair for an uncontested, verified Riot identity", async () => {
    await q`UPDATE wp_links SET verified=false WHERE user_id=2`;
    try {
      expect((await getPost(12,viewer))?.authorFlair).toBeNull();
      expect((await getPost(12,null))?.authorStatsHref).toBeUndefined();
      await q`UPDATE wp_links SET verified=true WHERE user_id=2`;
      await q`INSERT INTO wp_links(user_id,puuid,verified) VALUES(3,'ref',true)`;
      expect((await getPost(12,viewer))?.authorFlair).toBeNull();
      expect((await getPost(12,viewer))?.authorStatsHref).toBeUndefined();
    } finally {
      await q`DELETE FROM wp_links WHERE user_id=3 AND puuid='ref'`;
      await q`UPDATE wp_links SET verified=true WHERE user_id=2`;
    }
  });
  it("uses the same verified positive streak in posts and profiles", async () => {
    const playedAt = Date.now() - 60_000;
    const matches = Array.from({length:3}, (_,i) => ({matchId:`NA1_${i}`, playedAt:playedAt-i*2000, win:true,queueId:420,champion:"Ashe"}));
    await q`UPDATE wp_players SET snapshot=${JSON.stringify({matches})}::jsonb, fetched_at=now() WHERE puuid='ref'`;
    try {
      expect((await feedByAuthor(2, viewer)).map(post => post.authorWinStreak)).toEqual([3,3,3]);
      expect((await linkedPlayers(2))[0].winStreak).toBe(3);
      await q`UPDATE wp_links SET verified=false WHERE user_id=2 AND puuid='ref'`;
      expect((await getPost(12,viewer))?.authorWinStreak).toBeUndefined();
      expect((await linkedPlayers(2))[0].winStreak).toBeNull();
      await q`UPDATE wp_links SET verified=true WHERE user_id=2 AND puuid='ref'`;
      await q`UPDATE wp_players SET fetched_at=now()-interval '11 minutes' WHERE puuid='ref'`;
      expect((await getPost(12,viewer))?.authorWinStreak).toBeUndefined();
      expect((await linkedPlayers(2))[0].winStreak).toBeNull();
    } finally {
      await q`UPDATE wp_links SET verified=true WHERE user_id=2 AND puuid='ref'`;
      await q`UPDATE wp_players SET snapshot='{"champPool":[{"champion":"Ashe"}]}'::jsonb,fetched_at=now() WHERE puuid='ref'`;
    }
  });
  it("confirms retries and declines joining an absent or held room", async () => {
    await q`INSERT INTO wp_rooms(id,slug,name,kind,safety_status) VALUES(876,'hidden-lobby','Hidden lobby','general','held')`;
    expect(await setRoomMembership(1,876,true)).toBe(false);
    expect(await setRoomMembership(1,99876,true)).toBe(false);
    expect(await setRoomMembership(1,1,true)).toBe(true);
    expect(await setRoomMembership(1,1,true)).toBe(true);
    expect(await setRoomMembership(1,1,false)).toBe(true);
    expect(await setRoomMembership(1,1,false)).toBe(true);
    expect(await q`SELECT room_id FROM wp_room_members WHERE user_id=1`).toEqual([]);
  });
  it("keeps held posts owner-only, hidden ancestors private, and skips empty comment enrichment", async () => {
    expect(await getPost(14,viewer)).toBeNull();
    expect((await getPost(14,own))?.status).toBe("held");
    expect(await getPost(20,own)).toBeNull();
    expect(await getPost(19,own)).toBeNull();
    expect(await getPost(18,null)).toBeNull();
    testQueries.length = 0;
    expect(await listComments(14,viewer)).toEqual([]);
    expect(testQueries).toHaveLength(1);
    expect(await listComments(15,viewer)).toEqual([]);
    const tree = await listComments(13,viewer);
    expect(tree.map(c=>c.id)).toEqual([101]);
    expect(tree[0].replies[0].replies[0].id).toBe(103);
  });
  it("filters builds before the limit and reconfirms only a published build owned by the actor", async () => {
    expect((await buildFeed(viewer,{champion:"aShE",offMeta:true})).map(p=>p.id)).toEqual([11]);
    expect((await buildFeed(viewer,{item:1001})).map(p=>p.id)).toEqual([11]);
    expect(await buildFeed(viewer,{champion:"Ashe",item:3190})).toEqual([]);
    expect((await buildFeed(viewer,{champion:"Lux"}))).toEqual([]);
    expect((await reconfirmBuild(viewer,11)).ok).toBe(false);
    testQueries.length=0;
    expect((await reconfirmBuild(own,11)).ok).toBe(true);
    expect(testQueries).toHaveLength(2);
    expect((await getPost(11,viewer))?.data).toMatchObject({patch:"16.23.1",keystone:{id:8465,name:"Guardian"}});
    await q`UPDATE wp_posts SET data=data || '{"items":[999999999],"patch":"16.22.1"}'::jsonb WHERE id=11`;
    expect(await reconfirmBuild(own,11)).toMatchObject({ok:false,error:expect.stringContaining("unavailable on the current patch")});
    expect((await getPost(11,viewer))?.data.patch).toBe("16.22.1");
    await q`UPDATE wp_posts SET data=data || '{"items":[1001],"patch":"16.23.1"}'::jsonb WHERE id=11`;
  });
  it("votes once per voter; only available poll options and actual visible targets accept input", async () => {
    testQueries.length=0;
    expect(await votePoll(viewer,12,0)).toBe(true);
    expect(testQueries).toHaveLength(1);
    expect(await votePoll(viewer,12,0)).toBe(true);
    expect(await votePoll(viewer,12,3)).toBe(false);
    expect(await votePoll(viewer,13,1)).toBe(false);
    expect(await votePoll(viewer,12,0.5)).toBe(false);
    expect((await getPost(12,viewer))?.pollResults).toEqual([2,0]);
    expect(await toggleReaction(viewer,"post",999,"GG",true)).toBe(false);
    expect(await toggleReaction(viewer,"post",15,"GG",true)).toBe(false);
    expect(await toggleReaction(viewer,"comment",105,"GG",true)).toBe(false);
    expect(await toggleReaction(viewer,"comment",101,"GG",true)).toBe(true);
    expect(await toggleReaction(viewer,"comment",101,"GG",true)).toBe(true);
    expect((await listComments(13,viewer))[0].reactions).toEqual({GG:1});
    expect(await toggleReaction(viewer,"comment",101,"GG",false)).toBe(true);
    expect((await listComments(13,viewer))[0].reactions).toEqual({});
  });
  it("accepts visible comment targets, while rejecting hidden ancestors, cross-thread targets and nested One Fixes", async () => {
    const send = (post: number, parent?: number, oneFix=false) => addComment(viewer,post,"Try the next drake together.",parent,oneFix);
    expect((await send(14)).ok).toBe(false);
    expect((await send(15)).ok).toBe(false);
    expect((await send(13,104)).ok).toBe(false);
    expect((await send(13,105)).ok).toBe(false);
    expect((await send(13,107)).ok).toBe(false);
    expect((await send(11,102)).ok).toBe(false);
    expect((await send(11,undefined,true)).ok).toBe(false);
    expect((await send(13,102,true)).ok).toBe(false);
    expect((await send(13,101)).ok).toBe(true);
    expect((await send(13,102)).ok).toBe(true);
    expect((await send(13,undefined,true)).ok).toBe(true);
  });
  it("rebuilds old game cards from Riot and keeps discussion readable after a snapshot rolls over", async () => {
    await postgres.exec(`UPDATE wp_players SET snapshot = snapshot || '{"matches":[
      {"matchId":"NA1_100","champion":"Ashe","queueId":420,"win":true,"kills":3,"deaths":2,"assists":9,"cs":20,"items":[2003],"baron":true},
      {"matchId":"NA1_99","champion":"Ashe","queueId":0,"win":false,"kills":1,"deaths":2,"assists":3,"cs":4,"items":[]}
    ]}'::jsonb WHERE puuid='ref';
    INSERT INTO wp_posts(id,author_id,kind,body,data) VALUES
      (80,2,'card','Discuss this match','{"puuid":"ref","matchId":"NA1_100","riotId":"Untrusted","motion":"defeat","match":{"kills":999,"teamBaronKills":99},"url":"https://unrelated.invalid"}');
    INSERT INTO wp_posts(id,author_id,kind,body,data,card_validated) VALUES
      (81,2,'card','Recent verified share','{"puuid":"ref","matchId":"NA1_99","riotId":"Player#NA1","motion":"victory","match":{"champion":"Ashe","win":false,"kills":1,"deaths":2,"assists":3,"cs":4,"items":[],"teamBaronKills":2}}',true)`);
    const card = await getPost(80,null);
    expect(card?.data).toMatchObject({riotId:"Player#NA1",motion:"victory",match:{champion:"Ashe",kills:3,assists:9,baron:true}});
    expect(card?.data.match).not.toHaveProperty("teamBaronKills");
    expect(card?.data).not.toHaveProperty("url");
    await postgres.exec(`UPDATE wp_players SET snapshot = snapshot - 'matches' WHERE puuid='ref'`);
    expect(await getPost(80,null)).toMatchObject({body:"Discuss this match",data:{}});
    expect(await getPost(81,null)).toMatchObject({body:"Recent verified share",data:{}});
  });
  it("keeps malformed legacy poll data from breaking a feed or accepting new votes", async () => {
    await postgres.exec(`INSERT INTO wp_posts(id,author_id,kind,body,data) VALUES
      (91,2,'poll','Legacy','{"options":["A",{}],"privateField":"unused"}')`);
    const post = await getPost(91,viewer);
    expect(post?.pollResults).toBeNull();
    expect(post?.data).toEqual({});
    expect(await votePoll(viewer,91,0)).toBe(false);
  });
  it("preserves existing Baron votes and their labels when reading customized legacy calls", async () => {
    await postgres.exec(`INSERT INTO wp_posts(id,author_id,kind,body,data) VALUES
      (92,2,'poll','Replay decision','{"options":["Baron","Dragon","Push the inhib","Reset & farm"],"call":true,"privateField":"old"}'),
      (93,2,'poll','Replay alternative','{"options":["Dragon","Reset"],"call":true}'),
      (94,2,'text','Replay discussion','{"call":true,"options":["Baron","Dragon","Push the inhib","Reset & farm"]}');
      INSERT INTO wp_poll_votes(post_id,user_id,option_idx) VALUES (92,1,3),(93,1,1)`);
    expect((await getPost(92, viewer))?.data).toEqual({options: BARON_CALL_OPTIONS, call: true});
    expect(await getPost(92, viewer)).toMatchObject({pollResults: [0, 0, 0, 1], myVote: 3});
    expect(await votePoll(viewer, 92, 2)).toBe(true);
    expect(await toggleReaction(viewer, "post", 92, "💜", true)).toBe(true);
    expect(await toggleReaction(viewer, "post", 92, "👎", true)).toBe(false);
    expect(await getPost(92, viewer)).toMatchObject({pollResults: [0, 0, 1, 0], myVote: 2, myReactions: ["💜"]});
    expect((await getPost(93, viewer))?.data).toEqual({options: ["Dragon", "Reset"]});
    expect(await getPost(93, viewer)).toMatchObject({pollResults: [0, 1], myVote: 1});
    expect((await getPost(94, viewer))?.data).toEqual({});
  });
  it("publishes clean new-account replies, flags borderline established replies, and offers an edit before a borderline new-account reply is queued", async () => {
    const fresh = { ...viewer, createdAt: new Date().toISOString() };
    const result = await addComment(fresh,13,"I liked that decision.");
    expect(result).toMatchObject({ok:true,status:"visible"});
    const borderline = "Check https://example.com";
    const flagged = await addComment(viewer,13,borderline);
    expect(flagged).toMatchObject({ok:true,status:"visible"});
    if (!flagged.ok) throw Error("flagged reply unavailable");
    expect(await q`SELECT action FROM wp_mod_log WHERE target_kind='comment' AND target_id=${flagged.postId}`).toEqual([{action:"flag"}]);
    const edged = "fuck shit, I liked that decision.";
    expect(await addComment(fresh,13,edged)).toMatchObject({ok:false,reconsider:true});
    expect(await addComment(fresh,13,edged,undefined,false,true)).toMatchObject({ok:true,status:"held"});
  });
  it("hides the contents of an urgent hold from its author and conversations in a held room", async () => {
    await postgres.exec(`INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence)
      VALUES ('1fb4e419-9ebd-4cab-8608-631fe6c25972','post',14,'threats','fixture');
      UPDATE wp_rooms SET safety_status='held' WHERE id=1`);
    try {
      expect(await listComments(13, viewer)).toEqual([]);
      expect(await getPost(12, null)).toBeNull();
      expect(await votePoll(own, 12, 0)).toBe(false);
    } finally {
      await postgres.exec("UPDATE wp_rooms SET safety_status='visible' WHERE id=1");
    }
    expect(await getPost(14, own)).toBeNull();
  });

});
