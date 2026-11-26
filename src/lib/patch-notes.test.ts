import { afterEach, expect, it, vi } from "vitest";
import { PATCH_NOTES_INDEX, publicPatch, resolveNotesUrl, storedNotesUrl } from "./patch-notes";

afterEach(() => vi.unstubAllGlobals());

it("relates public patch labels to Data Dragon versions and rejects malformed versions", () => {
  expect(publicPatch("14.24.1")).toBe("14.24");
  expect(publicPatch("16.23.2")).toBe("26.23");
  expect(publicPatch("16.x")).toBeNull();
  expect(storedNotesUrl("16.24.1","https://unrelated.invalid")).toBe(PATCH_NOTES_INDEX);
});

it("uses a direct Riot article only when its headline matches the confirmed patch", async () => {
  const head = vi.fn().mockResolvedValueOnce(new Response("<title>Patch 26.24 Notes</title>", {headers:{"content-type":"text/html"}}))
    .mockResolvedValueOnce(new Response("<title>Oops</title>", {headers:{"content-type":"text/html"}}))
    .mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch",head);
  expect(await resolveNotesUrl("16.24.1")).toBe("https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-24-notes/");
  expect(await resolveNotesUrl("16.24.1")).toBe(PATCH_NOTES_INDEX);
  expect(await resolveNotesUrl("16.24.1")).toBe(PATCH_NOTES_INDEX);
});
