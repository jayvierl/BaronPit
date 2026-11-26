import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "../../test/browser-storage";
import { clearBrowserAuthDrafts } from "./auth-draft";
import { emptyPostDraft, openTabDraft, postReceipt, readPostDraft } from "./composer-draft";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("signed-in thread drafts", () => {
  it("restores the complete edit and retry ID after reload, scoped to the account, room and tab", () => {
    const first = memoryStorage(), second = memoryStorage(), global = memoryStorage();
    const draft = { ...emptyPostDraft, kind:"poll" as const, body:"Take dragon?", options:["Reset","Stay"],
      champion:"Ashe", items:[1001], itemQuery:"Boots", runes:"Fleet", offMeta:true,
      clipUrl:"https://medal.tv/example", baronCall:true, submissionId:crypto.randomUUID() };
    openTabDraft(first,global,7,"post:4").save(draft);
    openTabDraft(second,global,7,"post:4").save({ ...draft, body:"Another tab" });
    expect(openTabDraft(first,global,7,"post:4").restored).toEqual(draft);
    expect(openTabDraft(second,global,7,"post:4").restored?.body).toBe("Another tab");
    expect(openTabDraft(first,global,8,"post:4").restored).toBeNull();
    expect(openTabDraft(first,global,7,"post:home").restored).toBeNull();
    openTabDraft(first,global,7,"post:4").save(emptyPostDraft);
    expect(first.length).toBe(0);
    expect(openTabDraft(second,global,7,"post:4").restored?.body).toBe("Another tab");
    expect(global.length).toBe(0);
  });
  it("removes expired drafts across this tab's rooms", () => {
    vi.useFakeTimers();
    const tab = memoryStorage(), global = memoryStorage();
    const open = (scope: string) => openTabDraft(tab,global,1,scope);
    open("post:1").save({ ...emptyPostDraft, body:"older" });
    vi.advanceTimersByTime(20*60_000);
    open("post:2").save({ ...emptyPostDraft, body:"newer" });
    vi.advanceTimersByTime(11*60_000);
    expect(open("post:2").restored?.body).toBe("newer");
    expect(tab.length).toBe(1);
    expect(open("post:1").restored).toBeNull();
  });
  it("sign-out invalidates other tabs even if suspended and an old tab cannot recreate a cleared draft", () => {
    const first = memoryStorage(), second = memoryStorage(), global = memoryStorage();
    const open = (tab:Storage) => openTabDraft(tab,global,1,"post:home");
    const inactive = open(second), draft = { ...emptyPostDraft, body:"private text" };
    inactive.save(draft);
    open(first).save(draft);
    first.setItem("unrelated","untouched");
    vi.stubGlobal("window", { localStorage:global, sessionStorage:first });
    clearBrowserAuthDrafts();
    expect(first.length).toBe(1);
    expect(first.getItem("unrelated")).toBe("untouched");
    inactive.save(draft);
    expect(open(second).restored).toBeNull();
    expect(second.length).toBe(0);
    inactive.save(draft);
    expect(second.length).toBe(0);
  });
  it("reads legacy text-only handoffs and bounds malformed stored data", () => {
    expect(readPostDraft({body:"guest"})).toEqual({...emptyPostDraft,body:"guest"});
    expect(readPostDraft({kind:"other",items:[-1,10,"20"],options:[{},null],body:"x".repeat(4000),submissionId:"x"}))
      .toMatchObject({kind:"text",items:[10],options:["",""],body:"x".repeat(2000),submissionId:null});
  });
  it("links directly only to a confirmed visible thread with a valid server id", () => {
    expect(postReceipt({status:"visible",postId:4})).toMatchObject({href:"/post/4",label:"View thread"});
    for (const status of ["held","withdrawn","removed","unexpected"])
      expect(postReceipt({status,postId:4}).href).toBe("/me#submissions");
    expect(postReceipt({status:"visible",postId:"/x"}).href).toBe("/me#submissions");
  });
});
