import { describe, expect, it, vi, afterEach } from "vitest";
const riot = vi.hoisted(() => ({championCatalog:vi.fn(),confirmedPatch:vi.fn(),getCachedPlayer:vi.fn()}));
vi.mock("./riot", () => riot);
import { preparePost, scoreSubmission } from "./post-input";
import { BARON_CALL_OPTIONS } from "./poll";
afterEach(() => {vi.clearAllMocks();vi.unstubAllGlobals();});
describe("public post payloads", () => {
  it("discards unrecognised fields and checks every poll answer", async () => {
    const post = await preparePost({kind:"poll",body:"Pick a build",data:{options:[" One ", "Two"],unsafe:"skip"}});
    expect(post).toMatchObject({ok:true,fields:["Pick a build","One","Two"],data:{options:["One","Two"]}});
    if (post.ok) expect(post.data).not.toHaveProperty("unsafe");
    expect(scoreSubmission(["A normal question","kill yourself"],false).action).toBe("block");
  });
  it("rejects malformed types, duplicate choices and arbitrary room ids",async()=>{
    for (const options of [[{},1], ["Same","same"], ["","hi"]]) {
      expect((await preparePost({kind:"poll",body:"What's next?",data:{options}})).ok).toBe(false);
    }
    expect((await preparePost({kind:"text",body:"Hello",roomId:-2})).ok).toBe(false);
    expect(await preparePost({kind:"text",body:"Hello",data:{url:"external"}})).toMatchObject({ok:true,data:{}});
  });
  it("keeps only a boolean Baron call on a poll with the original choices in order", async () => {
    const poll = {kind: "poll" as const, body: "Which call fits this replay?"};
    const options = [...BARON_CALL_OPTIONS];
    const result = await preparePost({...poll, data: {call: true, options, owner: "extra"}});
    expect(result.ok && result.data).toEqual({options, call: true});
    expect(result.ok && result.fields).toEqual([poll.body, ...options]);
    const ordinary = await preparePost({...poll, data: {call: "true", options}});
    expect(ordinary.ok && ordinary.data).toEqual({options});
    expect((await preparePost({...poll, data: {call: true, options: [...options].reverse()}})).ok).toBe(false);
    const text = await preparePost({...poll, kind: "text", data: {call: true, options}});
    expect(text.ok && text.data).toEqual({});
  });
  it("only stamps builds using the confirmed patch and current champion and item catalogs",async()=>{
    riot.confirmedPatch.mockResolvedValue("16.23.1");
    riot.championCatalog.mockResolvedValue({current:true,patch:"16.23.1",list:[{name:"Ashe",id:"Ashe"}]});
    vi.stubGlobal("fetch",async()=>Response.json({data:{"3006":{name:"Boots"}}}));
    expect(await preparePost({kind:"build",body:"Early boots",data:{champion:"ashe",items:[3006],patch:"35.9",offMeta:true}})).toMatchObject({ok:true,data:{patch:"16.23.1",champion:"Ashe",offMeta:true}});
    expect((await preparePost({kind:"build",body:"Unknown item",data:{champion:"Ashe",items:[99999]}})).ok).toBe(false);
    riot.championCatalog.mockResolvedValue({current:false,patch:"16.22.1",list:[{name:"Ashe",id:"Ashe"}]});
    expect((await preparePost({kind:"build",body:"Catalog expired",data:{champion:"Ashe",items:[3006]}})).ok).toBe(false);
  });
  it.each([[true, "victory", "defeat"], [false, "defeat", "victory"]] as const)(
    "derives %s cards and motion from the snapshot without persisting client overrides", async (win, motion, supplied) => {
    riot.getCachedPlayer.mockResolvedValue({gameName:"Example",tagLine:"NA1",puuid:"player",snapshot:{matches:[{matchId:"NA1_1",kills:3,champion:"Ashe",win,items:[],teamBaronKills:2}]}});
    const result = await preparePost({kind:"card",body:"Last match",data:{puuid:"player",matchId:"NA1_1",motion:supplied,match:{win:!win,kills:100,teamBaronKills:99},extra:"private"}});
    expect(result).toMatchObject({ok:true,data:{riotId:"Example#NA1",motion,match:{win,kills:3,teamBaronKills:2}}});
    if(result.ok) expect(result.data).not.toHaveProperty("extra");
  });
  it("does not assign motion to an incomplete match record", async () => {
    riot.getCachedPlayer.mockResolvedValue({snapshot:{matches:[{matchId:"NA1_1",champion:"Ashe"}]}});
    expect(await preparePost({kind:"card",body:"Last match",data:{puuid:"player",matchId:"NA1_1",motion:"victory"}})).toMatchObject({ok:false});
  });
});
