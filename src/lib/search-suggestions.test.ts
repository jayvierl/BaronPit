import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { postgres } from "../../test/postgres";
import { q } from "./db";
import type { User } from "./auth";
import { createPost, addComment } from "./social";
import { canOpenPlayerMention, mentionKey, readMentionBody, unavailableMention } from "./player-mentions";
import { canSuggestNames, searchNameSuggestions } from "./search-suggestions";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/typeahead");
  vi.stubEnv("VERCEL_ENV", "development");
  await q`SELECT 1`;
  await postgres.exec(`INSERT INTO wp_users(id,email,display_name) VALUES
    (1,'me@example.invalid','Viewer'), (2,'member@example.invalid','Jay Analyst'),
    (3,'mute@example.invalid','Jay Muted'), (4,'block@example.invalid','Jay Hidden'),
    (5,'hidden@example.invalid','Jay Held'), (6,'ban@example.invalid','Jay Suspended');
    UPDATE wp_users SET safety_status='held' WHERE id=5;
    UPDATE wp_users SET banned_until=now()+interval '1 day' WHERE id=6;
    INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (4,1);
    INSERT INTO wp_mutes(muter_id,muted_id) VALUES (1,3);
    INSERT INTO wp_players(puuid,platform,game_name,tag_line) VALUES
      ('local','na1','Jay Lewis','NA1'), ('away','euw1','Jay Lewis','NA1'), ('exact','kr','Ja','KR1'),
      ('percent','na1','Ja%y','100'), ('under','na1','Ja_y','100'), ('escape','na1','Ja!y','100'),
      ('suspended','na1','Jay Banned','BAN'), ('hidden','na1','Jay Blocked','HIDE'),
      ('muted','na1','Jay Muted','MUTE'), ('held','na1','Jay On Hold','HOLD'),
      ('unowned','na1','Jay Claimed','OPEN'), ('similar','na1','Major Jay','END');
    INSERT INTO wp_players(puuid,platform,game_name,tag_line,fetched_at) VALUES
      ('old','na1','JAY LEWIS','na1',now()-interval '1 day'),
      ('oldHidden','na1','JAY BLOCKED','hide',now()-interval '1 day');
    INSERT INTO wp_links(user_id,puuid,verified) VALUES
      (6,'suspended',true),(5,'held',true),(4,'hidden',true),(3,'muted',true),(4,'unowned',false);`);
}, 30_000);
afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

it("suggests stable literal prefixes at two characters across platforms, then narrows by tag and selected region", async () => {
  const players = (term: string) => searchNameSuggestions(term, "players", null);
  const hits = await players("jA");
  expect(hits).toHaveLength(6);
  expect(hits[0]).toEqual({ kind: "player", riotId: "Ja#KR1", platform: "kr" });
  expect(await players(" jay lewis #n ")).toEqual([
    { kind: "player", riotId: "Jay Lewis#NA1", platform: "euw1" },
    { kind: "player", riotId: "Jay Lewis#NA1", platform: "na1" },
  ]);
  expect(await searchNameSuggestions("JaY Lew", "players", 1, "na1")).toEqual([
    { kind: "player", riotId: "Jay Lewis#NA1", platform: "na1" },
  ]);
  for (const char of ["%", "_", "!"]) {
    expect(await players("ja" + char)).toEqual([{ kind: "player", riotId: "Ja" + char + "y#100", platform: "na1" }]);
  }
  expect(await players("ajor")).toEqual([]);
  expect(await players("JaY Lewis#no")).toEqual([]);
});

it("enforces signed-in visibility after selecting the latest owner and keeps unverified claims separate", async () => {
  const hidden = ["Jay Blocked", "Jay Muted", "Jay On Hold", "Jay Banned"];
  for (const name of hidden) expect(await searchNameSuggestions(name, "players", 1)).toEqual([]);
  expect(await searchNameSuggestions("jay cla", "all", 1)).toEqual([{ kind: "player", riotId: "Jay Claimed#OPEN", platform: "na1" }]);
  expect(await searchNameSuggestions("jay", "people", 1)).toEqual([{ kind: "person", id: 2, name: "Jay Analyst" }]);
  expect(await searchNameSuggestions("jay hidden", "people", null)).toEqual([{ kind: "person", id: 4, name: "Jay Hidden" }]);
  expect(await searchNameSuggestions("jay", "all", 1)).toContainEqual({ kind: "person", id: 2, name: "Jay Analyst" });
  expect(await searchNameSuggestions("jay held", "all", null)).toEqual([]);
});

it("rejects short, malformed and oversized prefixes before database access", () => {
  for (const term of ["", " J ", "🦊", "#NA1", "Jay#NA#1", "Jay\0Lewis", "J".repeat(81)]) {
    expect(canSuggestNames(term)).toBe(false);
  }
  for (const term of ["Ja", "瑟提", "Jay#", "Jay#n", "Ja%"]) expect(canSuggestNames(term)).toBe(true);
});

it("checks player tags at insert and when opened, with identical treatment of absent and hidden players", async () => {
  const user: User = { id:1, email:"me@example.invalid", displayName:"Viewer", avatarHue:1, bio:"",
    createdAt:new Date().toISOString(), bannedUntil:null, strikeCount:0, ageBand:"adult", termsCurrent:true };
  const token = (name: string, puuid: string) => "[[p:na1."+mentionKey(puuid)+"|@"+name+"]]";
  const submit = (name: string, puuid: string) => createPost(user, {kind:"text", body:"Queue with "+token(name,puuid)});
  expect(await searchNameSuggestions("Jay Lewis#NA1","mentions",1,"na1")).toEqual([
    {kind:"player", riotId:"Jay Lewis#NA1", platform:"na1", mentionKey:mentionKey("local")},
  ]);
  const created = await submit("Jay Lewis#NA1","local");
  expect(created).toMatchObject({ok:true,status:"visible"});
  if (!created.ok) throw new Error(created.error);
  expect(await canOpenPlayerMention(1,"na1","Jay Lewis","NA1",mentionKey("local"))).toBe(true);
  const blocked = {ok:false,error:unavailableMention};
  for (const [name,puuid] of [["Jay Muted#MUTE","muted"],["Jay Blocked#HIDE","hidden"],["Jay On Hold#HOLD","held"],
    ["Jay Banned#BAN","suspended"],["Missing#NA1","local"],["Jay Lewis#NA1","old"]]) {
    const [game,tag] = name.split("#");
    expect(await canOpenPlayerMention(1,"na1",game,tag,mentionKey(puuid))).toBe(false);
    expect(await submit(name,puuid)).toEqual(blocked);
    expect(await addComment(user,created.postId,token(name,puuid))).toEqual(blocked);
  }
  expect(await submit("BadToken","local")).toEqual(blocked);
  expect(await submit("Jay Claimed#OPEN","unowned")).toMatchObject({ok:true,status:"visible"});
  const body = "Check "+token("Jay Lewis#NA1","local");
  expect(await addComment(user,created.postId,body)).toMatchObject({ok:true,status:"visible"});
  expect(await q`SELECT body FROM wp_comments WHERE post_id=${created.postId}`).toEqual([{body}]);
});

it("caps distinct player tags and preserves abuse signals in the visible names and surrounding words", () => {
  const token = (name: string) => "[[p:na1."+mentionKey(name)+"|@"+name+"#NA1]]";
  const tokens = Array.from({length:6}, (_,i) => token("Player "+i));
  expect(readMentionBody(tokens.join(" ")).ok).toBe(false);
  expect(readMentionBody(Array(6).fill(tokens[0]).join(" ")).ok).toBe(true);
  const display = readMentionBody("Discord @contact · "+token("A Player")+" [[c:Lux|Lux]]");
  expect(display).toMatchObject({ok:true, text:"Discord @contact · @A Player#NA1 Lux", contactText:"Discord @contact · A Player NA1 Lux"});
});
