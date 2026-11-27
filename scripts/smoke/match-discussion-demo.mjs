import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { account, capture, fixtureContext, load, localPost, openFixtureBrowser, submit, visible } from "./browser-helpers.mjs";
import { startFixtureServer } from "./fixture-server.mjs";
import { depthMatchId, depthName, depthTag } from "./profile-depth-fixture.mjs";

const output = process.env.SMOKE_SCREENSHOTS
  ? resolve(process.env.SMOKE_SCREENSHOTS)
  : fileURLToPath(new URL("../../docs/match-discussion/", import.meta.url));
const discussion = "When the wave crashes, is it better to recall before dragon or stay for the next wave?";
const reply = "I would crash the wave and recall together. Then both laners can spend gold and arrive before dragon.";
const author = "Demo River";
const reviewer = "Demo Lane";
const authorId = 551;
const identity = `${depthName}#${depthTag}`;
const matchId = depthMatchId(0);
const playerPath = "/player?" + new URLSearchParams({ platform: "na1", riotId: identity });
const matchPath = `${playerPath}#match-${matchId}`;
const result = { checks: [], screenshots: [] };

async function screenshot(page, file) {
  await capture(page, join(output, file));
  result.screenshots.push(file);
}

async function check(name, run) {
  try {
    await run();
    result.checks.push(name);
    console.log("PASS " + name);
  } catch (error) {
    throw new Error(name + "\n" + error.message, { cause: error });
  }
}

function row(page) {
  return page.locator("#match-" + matchId);
}

async function matchRecord(page) {
  const match = await visible(row(page));
  const details = match.locator("details").filter({ has: match.page().locator("summary").filter({ hasText: "Match details" }) }).first();
  const alreadyOpen = await details.evaluate(el => el.open);
  if (!alreadyOpen) await details.locator("summary").first().click();
  await match.getByRole("group", { name: "Items", exact: true }).getByRole("link").nth(2).waitFor();
  const data = await match.evaluate(node => ({
    score: [...node.querySelectorAll(".sr-only")].map(text => text.textContent).find(text => /kills, .* assists$/.test(text)),
    items: [...node.querySelectorAll('[aria-label="Items"] a')].map(link => link.getAttribute("aria-label")),
    time: node.querySelector("time")?.getAttribute("datetime"),
    verdict: node.querySelector("[data-win]")?.textContent,
  }));
  if (!alreadyOpen) await details.locator("summary").first().click();
  assert.equal(data.verdict, "Victory");
  assert.equal(data.score, "6 kills, 2 deaths, 7 assists");
  assert.ok(data.time && data.items.length > 0);
  data.rank = await page.getByRole("region", { name: "League stats", exact: true }).textContent();
  return data;
}

async function hiddenPost(page, origin, path) {
  const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  const html = await response.text();
  assert.ok(response.status() === 404 || (response.status() === 200 && html.includes("NEXT_HTTP_ERROR_FALLBACK;404")));
  assert.ok(!html.includes(discussion));
}

async function main() {
  await mkdir(output, { recursive: true });
  const fixture = await startFixtureServer({ demo: true });
  const { origin } = fixture;
  let browser;
  try {
    browser = await openFixtureBrowser();
    const mobile = await fixtureContext(browser, origin, 390);
    const desktop = await fixtureContext(browser, origin, 1440);
    const river = await mobile.newPage();
    const lane = await desktop.newPage();
    const clientErrors = [];
    for (const page of [river, lane]) {
      page.setDefaultTimeout(11000);
      page.setDefaultNavigationTimeout(35000);
      page.on("pageerror", error => clientErrors.push(error.message));
    }

    let previewPath;
    let signInReturn;
    let firstRecord;
    let postPath;
    let replyPath;
    await check("Guest searches Riot ID and opens public match discussion with the keyboard", async () => {
      await load(river, origin, "/search?scope=players");
      const search = await visible(river.getByRole("combobox", { name: "Player name or Riot ID" }));
      await search.fill(identity);
      await river.getByRole("combobox", { name: "League region" }).selectOption("na1");
      await search.press("Enter");
      await river.waitForURL(url => url.pathname === "/player" && url.searchParams.get("riotId") === identity);
      firstRecord = await matchRecord(river);
      const discuss = await visible(row(river).getByRole("link", { name: "Discuss this match", exact: true }));
      const link = new URL(await discuss.getAttribute("href"), origin);
      assert.equal(link.origin, origin);
      assert.ok(!link.searchParams.has("puuid"), "The public Discuss this match URL omits Riot PUUID");
      await discuss.scrollIntoViewIfNeeded();
      await discuss.focus();
      await screenshot(river, "01-match-mobile.png");
      await river.keyboard.press("Enter");
      await river.waitForURL(url => url.pathname === link.pathname);
      previewPath = link.pathname + link.search;
      const preview = await visible(river.getByRole("region", { name: "Public match preview" }));
      assert.match(await preview.textContent(), /Nami/);
      assert.match(await preview.textContent(), /ownership of this Riot ID hasn’t been verified/);
      assert.doesNotMatch(await preview.textContent(), /Fixture Archer|fixture-profile-depth|example\.invalid/);
      assert.doesNotMatch(await river.content(), /fixture-profile-depth|example\.invalid/);
      await localPost(river, origin, "/api/questions", {
        action: "ask", discussionKind: "question", body: discussion, platform: "na1",
        riotId: identity, matchId, champion: "Nami", role: "Support", topic: "Objective", confirmPublicMatch: true,
      }, 401);
      await river.getByRole("textbox", { name: "Your question", exact: true }).fill(discussion);
      await (await visible(river.getByRole("button", { name: "Sign in to discuss", exact: true }))).click();
      await river.waitForURL(url => url.pathname === "/signin");
      signInReturn = new URL(river.url()).searchParams.get("next");
      assert.equal(new URL(signInReturn, origin).pathname, link.pathname);
      assert.ok(!river.url().includes(encodeURIComponent(discussion)));
    });

    await check("A script-disabled guest cannot submit or expose a draft in the URL", async () => {
      const context = await fixtureContext(browser, origin, 390, false);
      try {
        const page = await context.newPage();
        await load(page, origin, previewPath);
        const draft = page.locator("main textarea");
        assert.equal(await draft.isDisabled(), true);
        assert.equal(await draft.getAttribute("name"), null);
        await visible(page.getByRole("link", { name: "Sign in to continue" }));
      } finally {
        await context.close();
      }
    });

    await check("Unlinked author saves interests and returns to the public draft", async () => {
      await account(mobile, origin, fixture.session);
      await load(river, origin, "/?tab=following");
      await (await visible(river.getByRole("link", { name: "Choose room interests", exact: true }).first())).click();
      await river.waitForURL(url => url.pathname === "/rooms");
      await river.getByRole("searchbox", { name: "Find a room", exact: true }).fill("Nami");
      await (await visible(river.getByRole("link", { name: /Nami Mains/ }).first())).click();
      await river.waitForURL(url => url.pathname === "/rooms/champ-nami");
      await submit(river, await visible(river.getByRole("button", { name: "Join room", exact: true })),
        "/api/social/room-join", 200);
      await river.reload({ waitUntil: "domcontentloaded" });
      await visible(river.getByRole("button", { name: "Joined ✓", exact: true }));
      await load(river, origin, "/me");
      await visible(river.getByText(/Link a Riot ID|No Riot IDs linked|None linked yet/).first());
      await load(river, origin, signInReturn || previewPath);
      const draft = river.locator("main textarea");
      await draft.waitFor();
      await river.waitForFunction(text => document.querySelector("main textarea")?.value === text, discussion);
    });

    await check("Publication requires consent and yields a stable public match discussion", async () => {
      const bypass = await localPost(river, origin, "/api/social/post", {
        kind: "card", body: discussion, data: { puuid: "fixture-profile-depth", matchId },
      }, 400);
      assert.match(bypass.error, /Discuss this match/i);
      const denied = await localPost(river, origin, "/api/questions", {
        action: "ask", discussionKind: "question", body: discussion, platform: "na1", riotId: identity,
        matchId, champion: "Nami", role: "Support", topic: "Objective",
      }, 400);
      assert.equal(denied.ok, false);
      assert.match(denied.error, /public|acknowledge|confirm/i);
      const consent = await visible(river.getByRole("checkbox", { name: "Attach this public match to my post.", exact: true }));
      await consent.check();
      const sourceDetails = river.getByText("Match source details", { exact: true });
      await sourceDetails.click();
      await visible(river.getByText("Match snapshot as of", { exact: true }));
      await river.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await screenshot(river, "02-public-preview-mobile.png");
      await consent.scrollIntoViewIfNeeded();
      await screenshot(river, "02b-attachment-consent-mobile.png");
      const response = await submit(river, river.getByRole("button", { name: "Post discussion", exact: true }), "/api/questions", 201);
      assert.equal(response.status, "visible");
      postPath = "/post/" + response.postId;
      await river.waitForURL(url => url.pathname === postPath);
      assert.equal(typeof response.submitted.submissionId, "string");
      const replay = await localPost(river, origin, "/api/questions", response.submitted, 201);
      assert.equal(replay.postId, response.postId, "A retry keeps the original permalink");
      await load(river, origin, postPath);
      const article = await visible(river.getByRole("article", { name: `Post by ${author}` }));
      await visible(article.getByText(discussion, { exact: true }));
      const publicMatch = await visible(article.getByRole("region", { name: "Public match", exact: true }));
      assert.match(await publicMatch.textContent(), /Player ownership unverified/);
      assert.doesNotMatch(await publicMatch.textContent(), /Fixture Archer|example\.invalid|fixture-profile-depth/);
      const link = await visible(publicMatch.getByRole("link", { name: "View match", exact: true }));
      const returned = new URL(await link.getAttribute("href"), origin);
      assert.equal(returned.pathname, "/player");
      assert.equal(returned.searchParams.get("riotId"), identity);
      assert.equal(returned.searchParams.get("fromDiscussion"), String(response.postId));
      assert.equal(returned.hash, "#match-" + matchId);
      await screenshot(river, "03-published-thread-mobile.png");
    });

    await check("An independent account finds the thread in the feed and matchup hub", async () => {
      await account(desktop, origin, fixture.helperSession);
      await load(lane, origin, "/");
      await visible(lane.getByRole("article", { name: `Post by ${author}` }).getByText(discussion, { exact: true }));
      await load(lane, origin, "/questions?champion=Nami");
      const discussionLink = await visible(lane.locator(`main a[href="${postPath}"]`).first());
      await screenshot(lane, "04-matchup-hub-desktop.png");
      await discussionLink.click();
      await lane.waitForURL(url => url.pathname === postPath);
    });

    await check("Second account likes, saves, follows and replies using the real controls", async () => {
      const article = await visible(lane.getByRole("article", { name: `Post by ${author}` }));
      const like = await visible(article.getByRole("button", { name: /^Like,/ }));
      await submit(lane, like, "/api/social/react", 200);
      await visible(article.getByRole("button", { name: /^Like, 1 like$/ }));
      const library = article.locator('summary[aria-label="Save and manage thread notifications"]');
      await library.click();
      await submit(lane, await visible(article.getByRole("button", { name: "Save this post" })), "/api/library", 200);
      await visible(article.getByRole("button", { name: "Remove from saved" }));
      const authorLink = article.locator("a.post-author");
      assert.equal(await authorLink.getAttribute("href"), "/u/" + authorId);
      await authorLink.click();
      await lane.waitForURL(url => url.pathname === "/u/" + authorId);
      await submit(lane, await visible(lane.getByRole("button", { name: "Follow", exact: true })), "/api/social/follow", 200);
      await visible(lane.getByRole("button", { name: "Following", exact: true }));
      await load(lane, origin, "/?tab=following");
      await visible(lane.getByRole("article", { name: `Post by ${author}` }).getByText(discussion, { exact: true }));
      await load(lane, origin, "/playbook?tab=posts");
      await visible(lane.locator(`main a[href="${postPath}"]`).first());
      await load(river, origin, "/playbook?tab=posts");
      assert.equal(await river.locator(`main a[href="${postPath}"]`).count(), 0, "Saving is private to Demo Lane");
      await load(lane, origin, postPath);
      assert.equal(await article.getByRole("button", { name: /^Like, 1 like$/ }).getAttribute("aria-pressed"), "true");
      await lane.getByLabel("Your reply", { exact: true }).fill(reply);
      const posted = await submit(lane, lane.locator("form").filter({ has: lane.getByLabel("Your reply", { exact: true }) })
        .getByRole("button", { name: "Reply", exact: true }), "/api/social/comments", 200);
      replyPath = postPath + "#reply-" + posted.commentId;
      await visible(lane.getByText(reply, { exact: true }));
    });

    await check("Author opens the exact reply from Activity and returns to unchanged match stats", async () => {
      await load(river, origin, "/activity");
      const notification = await visible(river.locator(`main a[href="${replyPath}"]`).first());
      assert.match(await notification.locator("..").textContent(), new RegExp(reviewer + " replied to your post"));
      await screenshot(river, "05-reply-activity-mobile.png");
      await notification.click();
      await river.waitForURL(url => url.pathname + url.hash === replyPath);
      await river.waitForFunction(hash => document.activeElement?.id === hash, replyPath.split("#")[1]);
      await visible(river.getByText(reply, { exact: true }));
      const profileLink = await visible(river.getByRole("link", { name: /^View (the )?match$/ }));
      await profileLink.click();
      await river.waitForURL(url => url.pathname === "/player" && url.hash === "#match-" + matchId);
      assert.deepEqual(await matchRecord(river), firstRecord);
      await river.reload({ waitUntil: "domcontentloaded" });
      assert.deepEqual(await matchRecord(river), firstRecord);
      const back = await visible(river.getByRole("link", { name: /Back to discussion$/ }));
      assert.equal(new URL(await back.getAttribute("href"), origin).pathname, postPath);
      await back.click();
      await river.waitForURL(url => url.pathname === postPath);
      await visible(river.getByText(discussion, { exact: true }));
    });

    await check("Mute, block and author withdrawal respect viewer visibility", async () => {
      const id = Number(postPath.slice("/post/".length));
      await localPost(lane, origin, "/api/social/withdraw", { kind: "post", id }, 404);
      await localPost(lane, origin, "/api/social/mute", { userId: authorId, mute: true }, 200);
      await load(lane, origin, "/?tab=following");
      assert.equal(await lane.getByText(discussion, { exact: true }).count(), 0);
      await localPost(lane, origin, "/api/social/mute", { userId: authorId, mute: false }, 200);
      await load(lane, origin, "/?tab=following");
      await visible(lane.getByRole("article", { name: `Post by ${author}` }).getByText(discussion, { exact: true }));
      await localPost(lane, origin, "/api/social/block", { userId: authorId, block: true }, 200);
      await hiddenPost(lane, origin, postPath);
      await load(river, origin, postPath);
      assert.equal(await river.getByText(reply, { exact: true }).count(), 0);
      await load(river, origin, "/activity");
      assert.equal(await river.locator(`main a[href="${replyPath}"]`).count(), 0);
      const visitor = await (await fixtureContext(browser, origin, 390)).newPage();
      await load(visitor, origin, postPath);
      await visible(visitor.getByText(discussion, { exact: true }));
      await localPost(river, origin, "/api/social/withdraw", { kind: "post", id }, 200);
      await hiddenPost(visitor, origin, postPath);
      await load(river, origin, matchPath);
      assert.deepEqual(await matchRecord(river), firstRecord);
    });

    assert.deepEqual(clientErrors, []);
    await writeFile(join(output, "verification.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(`${result.checks.length} two-account browser checks passed.`);
  } catch (error) {
    console.error(fixture.output());
    throw error;
  } finally {
    await browser?.close();
    await fixture.stop();
  }
}

if (process.argv.includes("--serve")) {
  const fixture = await startFixtureServer({ demo: true });
  console.log("Local guest match: " + fixture.origin + matchPath);
  console.log("Press Ctrl+C to stop the fixture.");
  function stop() { void fixture.stop(); }
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} else {
  await main();
}
