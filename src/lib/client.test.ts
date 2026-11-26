import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "./client";
import { clipLink } from "./clip-link";

afterEach(() => vi.unstubAllGlobals());

describe("confirmed actions", () => {
  it("accepts an explicit success from the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, count: 2 })));
    expect(await postJson("/api/example", {})).toEqual({ ok: true, data: { ok: true, count: 2 } });
  });
  it.each([
    Response.json({ ok: false, error: "This post is held." }),
    Response.json({ ok: true }, { status: 403 }),
    new Response("sign in", { status: 200 }),
    Response.json({}, { status: 200 }),
  ])("treats unconfirmed responses as errors", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const result = await postJson("/api/example", {});
    expect(result.ok).toBe(false);
    expect(result.data.error).toBeTruthy();
  });
  it("recovers from lost connectivity without claiming success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await postJson("/api/example", {});
    expect(result.ok).toBe(false);
    expect(result.data.error).toMatch(/connection/i);
  });
});

describe("clip links", () => {
  it("normalises links to the video page and drops additional URL data", () => {
    expect(clipLink("https://youtu.be/abcdefghijk?t=5")?.href).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(clipLink("https://www.youtube.com/shorts/abcdefghijk")?.href).toBe(
      "https://www.youtube.com/watch?v=abcdefghijk",
    );
    expect(clipLink("https://medal.tv/games/league-of-legends/clips/A_play?q=2")?.href).toBe(
      "https://medal.tv/games/league-of-legends/clips/A_play",
    );
  });
  it("accepts only supported HTTPS video destinations", () => {
    for (const url of [
      "https://youtube.com/redirect?q=other",
      "http://youtu.be/abcdefghijk",
      "https://example.org/clip",
      "https://youtube.com.example/watch?v=abcdefghijk",
      "https://www.youtube.com:444/watch?v=abcdefghijk",
    ])
      expect(clipLink(url)).toBeNull();
  });
});
