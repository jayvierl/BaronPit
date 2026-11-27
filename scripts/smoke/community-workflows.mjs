import assert from "node:assert/strict";
import { depthMatchId, depthName, depthTag } from "./profile-depth-fixture.mjs";

export async function checkCommunityWorkflows(journey) {
  await journey("/search?q=Ashe", { includes: ["Champions", "/rooms/champ-ashe"] });
  await journey("/search?scope=league&q=Infinity", { includes: ["Items", "Infinity Edge", "/items/3031"] });
  await journey("/search?scope=players&q=Fixture+Support&region=na1", {
    includes: ["Fixture Support#WAVE"], excludes: ["fixture-support"],
  });
  await journey("/rooms/champ-ashe?view=discussions", {
    includes: ['aria-label="Champion hub"', "Discussions", "/rooms/champ-ashe?feed=builds"],
  });
  await journey("/rooms/champ-ashe?feed=builds", { includes: ["Community builds"] });
  const player = new URLSearchParams({ platform: "na1", riotId: `${depthName}#${depthTag}`, match: depthMatchId(0) });
  await journey("/player?" + player, { includes: ["View objective timeline"], excludes: ['aria-label="Objective timeline"'] });
  player.set("timeline", "objectives");
  const timeline = await journey("/player?" + player, { html: true, includes: ['aria-label="Objective timeline"', "Baron Nashor"] });
  assert.match(timeline, /12:34<\/span><strong>Dragon/);
  assert.match(timeline, /24:15<\/span><strong>Baron Nashor/);
  await journey("/api/social/quote", {
    method: "POST", status: 401, body: { postId: 521, body: "A visitor needs an account to quote." },
  });
  const body = "This decision is easier to evaluate when both teams start at the same gold.";
  const draft = { postId: 521, body, submissionId: "2d5ecfb3-5261-4fb5-9b34-b5f096231318" };
  const published = await journey("/api/social/quote", {
    session: true, method: "POST", status: 201, body: draft, includes: ['"status":"visible"'],
  });
  const quotePath = `/post/${published.postId}`;
  await journey(quotePath, { includes: [body, "Original post by", "Fixture win condition", "/post/521"] });
  await journey("/api/social/quote", {
    session: true, method: "POST", status: 201, body: draft, includes: [`"postId":${published.postId}`],
  });
  await journey("/api/social/withdraw", { session: true, method: "POST", body: { kind: "post", id: published.postId } });
  await journey(quotePath, { status: "missing", excludes: [body] });
}
