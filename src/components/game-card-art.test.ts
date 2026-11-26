import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchCard } from "./match-card";

describe("game card art", () => {
  it.each([[true, "victory", "Victory"], [false, "defeat", "Defeat"]] as const)(
    "renders a still and the known match result on the server for win=%s", (win, motion, label) => {
      const html = renderToStaticMarkup(createElement(MatchCard, {
        patch: "16.23.1",
        data: { motion: "untrusted", riotId: "Example#NA1",
          match: { champion: "Ashe", win, kills: 3, deaths: 2, assists: 5, cs: 122, items: [] } },
      }));
      expect(html).toContain(`data-motion="${motion}"`);
      expect(html).toContain(`/game-cards/${motion}.webp`);
      expect(html).toContain(`>${label}</span>`);
      expect(html).not.toContain("<video");
      expect(html).not.toContain(".webm");
    },
  );
  it("keeps missing match data legible without assuming a defeat", () => {
    const html = renderToStaticMarkup(createElement(MatchCard, { patch: "16.23.1", data: {} }));
    expect(html).toContain("Match details are unavailable");
    expect(html).not.toContain("data-motion");
  });
});
