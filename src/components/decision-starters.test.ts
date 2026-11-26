import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { findQuestionStarter, questionHref, questionStarters } from "@/lib/decisions-input";
import { DecisionComposer } from "./decision-composer";
import { MatchQuestionLinks } from "./match-question-links";
import { CommentSection } from "./comment-section";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const match = { puuid: "safe-player", matchId: "NA1_8", champion: "Ashe", role: "BOTTOM", opponent: "Jhin", riotId: "Bot#NA1", patch: "26.22" };
const champions = [{id:"Ashe", name:"Ashe"}, {id:"Jhin", name:"Jhin"}];
describe("match decision starters", () => {
  it("offers all three starter links on the latest match and leaves other cards compact", () => {
    const show = (showStarters: boolean) => renderToStaticMarkup(createElement(MatchQuestionLinks, {...match,showStarters}));
    const first = show(true);
    for (const starter of questionStarters) {
      expect(first).toContain(starter.label);
      const url = new URL(questionHref(match,starter.id),"https://test.invalid");
      expect(url.searchParams.get("starter")).toBe(starter.id);
      expect(url.searchParams.get("matchId")).toBe(match.matchId);
    }
    expect(show(false)).not.toContain("When should I have recalled?");
    expect(findQuestionStarter("arbitrary input")).toBeUndefined();
  });
  it("prefills an editable guest draft with the game, opposing role, match patch and decision topic", () => {
    const html = renderToStaticMarkup(createElement(DecisionComposer,{champions,match,
      starter:findQuestionStarter("recall"),destination:questionHref(match,"recall"),signedIn:false}));
    expect(html).toContain("When should I have recalled?</textarea>");
    expect(html).toContain('value="Jhin" selected=""');
    expect(html).toContain('<option selected="">Macro</option>');
    expect(html).toContain("Match patch 26.22");
    expect(html).toContain("Sign in to ask");
  });
  it("makes answer coaching optional and displays it only on decision questions", () => {
    const render = (decisionQuestion:boolean) => renderToStaticMarkup(createElement(CommentSection,{postId:42,signedIn:false,decisionQuestion}));
    expect(render(true)).toContain("Help me frame my answer");
    expect(render(true)).toContain("When would you choose differently?");
    expect(render(false)).not.toContain("Help me frame my answer");
  });
});
