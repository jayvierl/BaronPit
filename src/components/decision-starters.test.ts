import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { findQuestionStarter, matchDiscussionThread, questionHref, questionStarters, returnToMatch } from "@/lib/decisions-input";
import { matchContextHref, type MatchContext } from "@/lib/match-context";
import { DecisionComposer } from "./decision-composer";
import { MatchQuestionLinks } from "./match-question-links";
import { CommentSection } from "./comment-section";
import { MatchDiscussionPreview } from "./match-discussion-preview";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const selection = { platform: "na1", riotId: "Bot#NA1", matchId: "NA1_8" } as const;
const match: MatchContext = { ...selection, matchHref: matchContextHref(selection), region: "na1", champion: "Ashe", role: "BOTTOM",
  opponent: "Jhin", patch: "26.22", queueId: 420, win: true, authorRole: "spectator", kills: 8, deaths: 2, assists: 10,
  cs: 180, durationSec: 1900, playedAt: Date.UTC(2026, 10, 25), sourceUpdatedAt: "2026-11-26T00:00:00Z" };
const champions = [{id:"Ashe", name:"Ashe"}, {id:"Jhin", name:"Jhin"}];
describe("match decision starters", () => {
  it("offers all three starter links on the latest match and leaves other cards compact", () => {
    const show = (showStarters: boolean) => renderToStaticMarkup(createElement(MatchQuestionLinks, { match, showStarters }));
    const first = show(true);
    for (const starter of questionStarters) {
      expect(first).toContain(starter.label);
      const url = new URL(questionHref(match,starter.id),"https://test.invalid");
      expect(url.searchParams.get("starter")).toBe(starter.id);
      expect(url.searchParams.get("matchId")).toBe(match.matchId);
      expect(url.searchParams.get("platform")).toBe("na1");
      expect(url.searchParams.get("riotId")).toBe("Bot#NA1");
      expect(url.searchParams.has("puuid")).toBe(false);
    }
    expect(show(false)).not.toContain("When should I have recalled?");
    expect(findQuestionStarter("arbitrary input")).toBeUndefined();
  });
  it("prefills a neutral draft and safely falls back to a sign-in link before hydration", () => {
    const html = renderToStaticMarkup(createElement(DecisionComposer,{champions,match,
      starter:findQuestionStarter("recall"),destination:questionHref(match,"recall"),signedIn:false}));
    expect(html).toContain("When would you recall in this situation?</textarea>");
    expect(html).toContain('value="Jhin" selected=""');
    expect(html).toContain('<option selected="">Macro</option>');
    expect(html).toContain("Match patch 26.22");
    expect(html).toContain("Sign in to ask");
    expect(html).toMatch(/<fieldset[^>]+disabled=""/);
    expect(html).not.toMatch(/<(?:textarea|select|input)[^>]*\bname=/);
    expect(html).toMatch(/<noscript><a href="\/signin\?next=/);
  });
  it("shows selected evidence plus explicit consent before publication and labels a saved perspective", () => {
    const composer = renderToStaticMarkup(createElement(DecisionComposer,{champions,match,
      destination:questionHref(match,undefined,{ discuss: true }),signedIn:true,discuss:true}));
    expect(composer).toContain('aria-label="Public match preview"');
    expect(composer).toContain('aria-pressed="true">Question');
    expect(composer).toContain('aria-pressed="false">Perspective');
    expect(composer).toContain("Sharing a public match. Your ownership of this Riot ID hasn’t been verified.");
    expect(composer).toContain("The public card identifies Bot#NA1");
    expect(composer).toContain("Attach this public match to my post.");
    expect(composer).toContain("Post discussion");
    expect(composer).toContain("/me#submissions");
    const html = renderToStaticMarkup(createElement(MatchDiscussionPreview, { match: { ...match, discussionKind: "perspective" }, postId: 42 }));
    expect(html).toContain('aria-label="Public match"');
    expect(html).toContain("Player ownership unverified · Perspective · Riot match data");
    expect(html).toContain("fromDiscussion=42#match-NA1_8");
    expect(html).not.toContain("Post discussion");
    for (const rendered of [composer, html]) {
      expect(rendered).toContain("<summary>Match source details</summary>");
      expect(rendered).toContain("<dt>Match region</dt><dd>North America (NA1)</dd>");
      expect(rendered).toMatch(/<dt>Played<\/dt><dd><time dateTime="2026-11-25T00:00:00\.000Z">Nov 25, 2026, 12:00 AM UTC/);
      expect(rendered).toMatch(/<dt>Riot record retrieved<\/dt><dd><time dateTime="2026-11-26T00:00:00\.000Z">Nov 26, 2026, 12:00 AM UTC/);
    }
  });
  it("brings an ARAM team discussion to the editor without asking the visitor to invent a lane", () => {
    const html = renderToStaticMarkup(createElement(DecisionComposer, { champions, match: { ...match, role: "TEAM", queueId: 450 },
      destination:questionHref(match, undefined, { discuss: true }), signedIn:true, discuss:true }));
    expect(html).toContain("Team discussion · Riot did not provide a lane.");
    expect(html).toContain('<option selected="">Teamfight</option>');
    expect(html).not.toContain("Choose a role");
  });
  it("preserves intentional history state for the same exact player and game only", () => {
    const from = "/player?platform=na1&riotId=Bot%23NA1&queue=420&champion=Ashe&older=4&force=1&unknown=drop&match=NA1_9#match-NA1_8";
    const expected = "/player?platform=na1&riotId=Bot%23NA1&queue=420&champion=Ashe&older=4&match=NA1_8#match-NA1_8";
    expect(returnToMatch(from, match)).toBe(expected);
    expect(returnToMatch(from.replace("riotId=Bot", "riotId=Another"), match)).toBeUndefined();
    expect(returnToMatch(from.replace("platform=na1", "platform=euw1"), match)).toBeUndefined();
    expect(returnToMatch(from.replace("#match-NA1_8", "#match-NA1_9"), match)).toBeUndefined();
    expect(returnToMatch("//example.test" + from, match)).toBeUndefined();
    const target = new URL(matchDiscussionThread(42, match, from), "https://test.invalid");
    expect(target.pathname).toBe("/post/42");
    expect(target.searchParams.get("fromMatch")).toBe(expected);
  });
  it("makes answer coaching optional and displays it only on decision questions", () => {
    const render = (decisionQuestion:boolean) => renderToStaticMarkup(createElement(CommentSection,{postId:42,signedIn:false,decisionQuestion}));
    expect(render(true)).toContain("Help me frame my answer");
    expect(render(true)).toContain("When would you choose differently?");
    expect(render(false)).not.toContain("Help me frame my answer");
  });
});
