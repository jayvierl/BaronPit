import { describe, expect, it } from "vitest";
import { composeDestination, previousAppPage } from "./navigation-context";

describe("community navigation", () => {
  const current = "https://community.example/post/42#reply-8";
  it("keeps writing in the current feed or room", () => {
    for (const path of ["/", "/rooms/champ-nami", "/rooms/general/"]) expect(composeDestination(path)).toBe("#compose");
    for (const path of ["/rooms", "/rooms/general/settings", "/u/4", "/lfg"]) expect(composeDestination(path)).toBe("/#compose");
  });
  it("restores a local room, search or Activity tab with its filters intact", () => {
    for (const route of ["/rooms/general", "/?tab=following", "/search?q=%23mid", "/activity?tab=watching&before=24", "/post/6#reply-7"]) {
      expect(previousAppPage("https://community.example" + route,current)).toBe(route);
    }
  });
  it("falls back for external entries, authentication, absence and same-thread anchors", () => {
    for (const prior of [null, "invalid", "https://elsewhere.example/search", "https://community.example.evil.test/",
      "https://community.example/api/auth/verify", "https://community.example/signin/confirm#secret",
      "https://community.example/post/42", "https://community.example/post/42#reply-9"]) expect(previousAppPage(prior,current)).toBeNull();
  });
});
