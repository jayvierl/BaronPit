import { afterEach, describe, expect, it, vi } from "vitest";
import { beginDraftSignIn, consumeAuthDraft } from "./auth-draft";
import { signInHref, safeReturnTo } from "./signin-return";

import { memoryStorage } from "../../test/browser-storage";
afterEach(() => vi.useRealTimers());
describe("discussion continuation", () => {
  it("keeps internal query strings and anchors and excludes callback or external destinations", () => {
    const dest = "/post/107?tab=latest#replies-107";
    expect(safeReturnTo(dest)).toBe(dest);
    expect(safeReturnTo("/review-hour")).toBe("/review-hour");
    for (const unsafe of [null, "https://other.invalid", "//other.invalid", "/signin/confirm", "/api/auth/verify", "/rooms/../api/track", "/%2fother.invalid", "/review-hour/calendar"]) {
      expect(safeReturnTo(unsafe)).toBe("/me");
    }
    const login = new URL(signInHref(dest,"signup"),"https://ward.test");
    expect(login.searchParams.get("mode")).toBe("signup");
    expect(login.searchParams.get("next")).toBe(dest);
  });
  it("keeps private text out of URLs and resumes only the matching room or thread once", () => {
    const storage = memoryStorage(), scope = "reply:7";
    const login = beginDraftSignIn(storage, scope, "/post/7#replies-7", {body: "my draft", rootId: 4});
    expect(login).not.toContain("my+draft");
    const dest = new URL(login, "https://ward.test").searchParams.get("next")!;
    expect(consumeAuthDraft(storage, "reply:8", dest)).toBeNull();
    expect(consumeAuthDraft(storage, scope, dest)).toEqual({destination: "/post/7#replies-7", payload:{body:"my draft",rootId:4}});
    expect(consumeAuthDraft(storage, scope, dest)).toBeNull();
    expect(storage.length).toBe(0);
  });
  it("drops expired drafts", () => {
    vi.useFakeTimers();
    const storage = memoryStorage(), link = beginDraftSignIn(storage,"post:home","/#compose",{body:"hello"});
    vi.advanceTimersByTime(31*60000);
    const dest = new URL(link, "https://ward.test").searchParams.get("next")!;
    expect(consumeAuthDraft(storage,"post:home",dest)).toBeNull();
    expect(storage.length).toBe(0);
  });
});
