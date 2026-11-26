import {afterAll,afterEach,beforeAll,expect,it,vi} from "vitest";
vi.mock("@neondatabase/serverless",async()=>({neon:(await import("../../test/postgres")).neonForTests}));
import {postgres} from "../../test/postgres";
import {q} from "./db";
import {beginOwnership,consumeOwnershipState,verifyLinkedOwner,fetchOwnedRiotId,riotSignOnConfig,authorizationUrl} from "./riot-ownership";

beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","postgresql://fixture.invalid/ownership");
  vi.stubEnv("VERCEL_ENV","development");
  await q`INSERT INTO wp_users(id,email,display_name) VALUES(21,'a@example.test','a'),(22,'b@example.test','b')`;
  await q`INSERT INTO wp_players(puuid,platform,game_name,tag_line) VALUES('claimed','na1','Example','NA1')`;
  await q`INSERT INTO wp_links(user_id,puuid) VALUES(21,'claimed'),(22,'claimed')`;
},30000);
afterAll(async()=>{vi.unstubAllEnvs();await postgres.close();});
afterEach(()=>vi.unstubAllGlobals());
it("binds a one-use state to the signed-in claimant and selected profile",async()=>{
  expect(await beginOwnership(21,"other")).toBeNull();
  const state=await beginOwnership(21,"claimed");
  expect(await consumeOwnershipState(22,state!)).toBeNull();
  expect(await consumeOwnershipState(21,state!)).toBe("claimed");
  expect(await consumeOwnershipState(21,state!)).toBeNull();
});
it("requires an exact proven identity and excludes competing claims",async()=>{
  expect(await verifyLinkedOwner(21,"claimed","other")).toBe(false);
  expect(await verifyLinkedOwner(21,"claimed","claimed")).toBe(true);
  expect(await verifyLinkedOwner(22,"claimed","claimed")).toBe(false);
  expect(await q`SELECT user_id FROM wp_links WHERE verified`).toEqual([{user_id:21}]);
});
it("uses the official authorization and account endpoints without requesting persistent access",async()=>{
  vi.stubEnv("RIOT_RSO_CLIENT_ID","fixture");vi.stubEnv("RIOT_RSO_CLIENT_SECRET","fixture-secret");
  vi.stubEnv("RIOT_RSO_REDIRECT_URI","http://invalid.test/callback");
  expect(riotSignOnConfig()).toBeNull();
  vi.stubEnv("RIOT_RSO_REDIRECT_URI","https://site.test/api/account/riot/callback");
  const config=riotSignOnConfig()!;
  const url=authorizationUrl(config,"random-state");
  expect(url.origin).toBe("https://auth.riotgames.com");expect(url.searchParams.get("scope")).toBe("openid");
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({access_token:"short-lived"}))
    .mockResolvedValueOnce(Response.json({puuid:"proven"}));
  vi.stubGlobal("fetch",fetcher);
  expect(await fetchOwnedRiotId(config,"code")).toBe("proven");
  expect(fetcher.mock.calls.map(c=>c[0])).toEqual(["https://auth.riotgames.com/token","https://americas.api.riotgames.com/riot/account/v1/accounts/me"]);
});
