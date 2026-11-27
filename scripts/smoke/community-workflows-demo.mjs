import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { account, capture, fixtureContext, load, localPost, openFixtureBrowser, submit, visible } from "./browser-helpers.mjs";
import { startFixtureServer } from "./fixture-server.mjs";
import { verifyPlayerSuggestions } from "./player-search-suggestions.mjs";
import { depthMatchId, depthName, depthTag } from "./profile-depth-fixture.mjs";

const output = process.env.SMOKE_SCREENSHOTS ? resolve(process.env.SMOKE_SCREENSHOTS)
  : fileURLToPath(new URL("../../docs/integrated-community/evidence/", import.meta.url));
const report = { build: (await readFile(new URL("../../.next/BUILD_ID", import.meta.url), "utf8")).trim(), checks: [], screenshots: [] };
const author = "Demo River";
const reviewer = "Demo Lane";
const reviewerId = 552;
const itemSearch = "Infinity";
const item = "Infinity Edge";
const itemId = 3031;
const buildBody = "I tested this off-meta setup in practice. Boots helped me keep enough distance after short trades.";
const quoteBody = "The next thing I would test is whether waiting for the wave leaves time to reset before dragon.";
const replyBody = "Could you compare a control build in the same matchup? I would start with the same first recall.";
const matchBody = "Should I push the second wave if I want to arrive first at the river?";
const answerBody = "Watch where your jungler starts and count the enemy minions before pushing for river priority.";
const identity = `${depthName}#${depthTag}`;
const matchId = depthMatchId(0);
const playerPath = "/player?" + new URLSearchParams({ platform: "na1", riotId: identity });

async function check(name, run) {
  try {
    await run();
    console.log("PASS " + name);
    report.checks.push(name);
  } catch (error) {
    throw new Error(name + "\n" + error.message, { cause: error });
  }
}

async function screenshot(page, file) {
  await capture(page, join(output, file));
  report.screenshots.push(file);
}

function article(page, name) {
  return page.getByRole("article", { name: `Post by ${name}`, exact: true });
}

function postBody(post, body) {
  return post.locator("p.post-body").filter({ hasText: body });
}

function searchBox(page) {
  return page.getByRole("main").getByLabel("Search the community", { exact: true });
}

async function search(page, term) {
  const input = await visible(searchBox(page));
  await input.fill(term);
  await input.press("Enter");
  await page.waitForURL(url => url.pathname === "/search" && url.searchParams.get("q") === term);
}

async function withoutPost(page, origin, path, body) {
  const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  const html = await response.text();
  assert.ok(response.status() === 404 || (response.status() === 200 && html.includes("NEXT_HTTP_ERROR_FALLBACK;404")));
  assert.ok(!html.includes(body));
}

await mkdir(output, { recursive: true });
const fixture = await startFixtureServer({ demo: "workflows" });
const { origin } = fixture;
let browser;
try {
  browser = await openFixtureBrowser();
  const visitor = await (await fixtureContext(browser, origin, 390)).newPage();
  const riverContext = await fixtureContext(browser, origin, 390);
  const laneContext = await fixtureContext(browser, origin, 1440);
  await account(riverContext, origin, fixture.session);
  await account(laneContext, origin, fixture.helperSession);
  const river = await riverContext.newPage();
  const lane = await laneContext.newPage();
  const clientErrors = [];
  for (const page of [visitor, river, lane]) {
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(35000);
    page.on("pageerror", error => clientErrors.push(error.message));
  }
  let buildPath;
  let buildId;
  let quotePath;
  let discussionPath;

  await check("Partial names open the right player with keyboard and touch, while ordinary search still works", () =>
    verifyPlayerSuggestions(browser, origin));

  await check("Keyboard and native Explore reach the room shortcuts", async () => {
    for (const page of [visitor, lane]) {
      await load(page, origin, "/");
      await page.waitForLoadState("load");
      const trigger = page.locator('summary[aria-label="Explore"]:visible');
      await trigger.focus();
      await page.keyboard.press("Enter");
      const menu = await visible(page.getByRole("navigation", { name: "Explore destinations" }));
      await page.keyboard.press("Tab");
      assert.equal(await menu.getByRole("link", { name: "Following", exact: true }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    }
    const native = await fixtureContext(browser, origin, 390, false);
    try {
      const page = await native.newPage();
      await load(page, origin, "/");
      await page.waitForLoadState("load");
      await page.locator('summary[aria-label="Explore"]:visible').click();
      const rooms = page.getByRole("navigation", { name: "Explore destinations" }).getByRole("link", { name: "General", exact: true });
      await (await visible(rooms)).click();
      await page.waitForURL(url => url.pathname === "/rooms/general");
      await visible(page.getByRole("heading", { name: /The Baron Pit|General/ }).first());
    } finally {
      await native.close();
    }
  });

  await check("Visitor discovers a champion through mobile search and navigates the champion hub", async () => {
    await load(visitor, origin, "/");
    await (await visible(visitor.getByRole("link", { name: "Search", exact: true }).last())).click();
    await search(visitor, "Nami");
    const champions = visitor.getByRole("heading", { name: "Champions", exact: true }).locator("..");
    const nami = await visible(champions.getByRole("link", { name: /Nami/ }));
    assert.equal(new URL(await nami.getAttribute("href"), origin).pathname, "/rooms/champ-nami");
    await nami.click();
    await visitor.waitForURL(url => url.pathname === "/rooms/champ-nami");
    const hub = await visible(visitor.getByRole("navigation", { name: "Champion hub" }));
    assert.equal(await hub.getByRole("link", { name: "Overview", exact: true }).getAttribute("aria-current"), "page");
    await visible(visitor.getByRole("heading", { name: "Recent match sample", exact: true }));
    await hub.scrollIntoViewIfNeeded();
    await screenshot(visitor, "01-champion-hub-mobile.png");
    await hub.getByRole("link", { name: "Discussions", exact: true }).click();
    await visitor.waitForURL(url => url.searchParams.get("view") === "discussions");
    assert.equal(await hub.getByRole("link", { name: "Discussions", exact: true }).getAttribute("aria-current"), "page");
    await hub.getByRole("link", { name: "Builds", exact: true }).click();
    await visitor.waitForURL(url => url.searchParams.get("feed") === "builds");
    await visible(visitor.getByRole("heading", { name: "Community builds", exact: true }));
    assert.equal(await hub.getByRole("link", { name: "Builds", exact: true }).getAttribute("aria-current"), "page");
    const compose = visitor.getByRole("navigation", { name: "Primary", exact: true })
      .getByRole("link", { name: "Post to the Pit", exact: true });
    await compose.focus();
    await visitor.keyboard.press("Enter");
    await visitor.waitForURL(url => url.pathname === "/builds" && url.searchParams.get("champ") === "Nami" &&
      url.searchParams.get("room") === "1" && url.searchParams.get("compose") === "1");
    await visible(visitor.locator("#compose textarea"));

    const native = await fixtureContext(browser, origin, 390, false);
    try {
      const page = await native.newPage();
      for (const path of ["/", "/rooms/general"]) {
        await load(page, origin, path);
        const draft = page.locator("#compose textarea");
        assert.equal(await draft.count(), 1);
        assert.equal(await draft.isVisible(), false);
        await page.getByRole("navigation", { name: "Primary", exact: true })
          .getByRole("link", { name: "Post to the Pit", exact: true }).focus();
        await page.keyboard.press("Enter");
        await visible(draft);
        await visible(page.locator("#compose").getByRole("link", { name: "Open sign-in", exact: true }));
      }
    } finally {
      await native.close();
    }
  });

  await check("League search opens canonical item details and passes the item into the build composer", async () => {
    await load(river, origin, "/search");
    await search(river, itemSearch);
    const scope = river.getByRole("navigation", { name: "Search categories" });
    await (await visible(scope.locator('a[href*="scope=league"]'))).click();
    await river.waitForURL(url => url.searchParams.get("scope") === "league");
    const itemLink = await visible(river.getByRole("link", { name: new RegExp(item) }));
    const itemPath = await itemLink.getAttribute("href");
    assert.equal(new URL(itemPath, origin).pathname, `/items/${itemId}`);
    await itemLink.click();
    await river.waitForURL(url => url.pathname === `/items/${itemId}`);
    await visible(river.getByRole("heading", { name: item, exact: true }));
    const returnSearch = new URL(await river.getByRole("link", { name: /Back to search$/ }).getAttribute("href"), origin);
    assert.equal(returnSearch.searchParams.get("q"), itemSearch);
    assert.equal(returnSearch.searchParams.get("scope"), "league");
    await (await visible(river.getByRole("link", { name: `Share a build with ${item}`, exact: true }))).click();
    await river.waitForURL(url => url.pathname === "/builds" && url.searchParams.get("compose") === "1");
    await visible(river.getByRole("button", { name: `Remove ${item}, slot 1`, exact: true }));
  });

  await check("Structured build publishes to one permalink and is indexed in champion search and its hub", async () => {
    await river.getByRole("textbox", { name: "Build reasoning", exact: true }).fill(buildBody);
    const champion = river.getByLabel("Champion", { exact: true });
    if (await champion.evaluate(node => node.tagName) === "SELECT") await champion.selectOption({ label: "Nami" });
    else await champion.fill("Nami");
    await river.getByLabel("Search items", { exact: true }).fill("Boots");
    await (await visible(river.getByRole("button", { name: "Boots", exact: true }))).click();
    const keystone = river.getByLabel(/^Keystone/);
    await keystone.selectOption("8005");
    assert.equal(await keystone.inputValue(), "8005");
    const offMeta = await visible(river.getByRole("checkbox", { name: /Off-meta build/i }));
    await offMeta.check();
    await offMeta.scrollIntoViewIfNeeded();
    await screenshot(river, "02-build-composer-mobile.png");
    const published = await submit(river, river.getByRole("button", { name: "Publish build", exact: true }), "/api/social/post", 200);
    assert.equal(published.status, "visible");
    assert.deepEqual(published.submitted.data.items, [itemId, 1001]);
    assert.equal(published.submitted.data.keystoneId, 8005);
    const retry = await localPost(river, origin, "/api/social/post", published.submitted, 200);
    assert.equal(retry.postId, published.postId);
    buildId = published.postId;
    buildPath = `/post/${buildId}`;
    const receipt = await visible(river.getByRole("link", { name: "View build discussion", exact: true }));
    assert.equal(new URL(await receipt.getAttribute("href"), origin).pathname, buildPath);
    await receipt.click();
    await river.waitForURL(url => url.pathname === buildPath);
    const build = await visible(article(river, author));
    await visible(postBody(build, buildBody));
    const linkedItem = await visible(build.getByRole("link", { name: new RegExp(`^${item},`) }));
    assert.equal(new URL(await linkedItem.getAttribute("href"), origin).pathname, `/items/${itemId}`);
    const back = await visible(river.getByRole("link", { name: /Back to item$/ }));
    assert.equal(new URL(await back.getAttribute("href"), origin).pathname, `/items/${itemId}`);
    await visible(build.getByText(/Press the Attack/));
    await screenshot(river, "03-build-permalink-mobile.png");
    await load(lane, origin, "/search?scope=builds&q=Nami");
    await visible(postBody(article(lane, author), buildBody));
    await screenshot(lane, "03b-build-search-desktop.png");
    await load(lane, origin, "/rooms/champ-nami?feed=builds");
    await visible(postBody(article(lane, author), buildBody));
    await (await visible(lane.getByRole("link", { name: "Explore all Nami builds", exact: true }))).click();
    await lane.waitForURL(url => url.pathname === "/builds" && url.searchParams.get("champ") === "Nami");
    await visible(postBody(article(lane, author), buildBody));
  });

  await check("A separate account can save, reply, repost, and publish an idempotent native quote", async () => {
    await load(lane, origin, buildPath);
    const build = await visible(article(lane, author));
    const library = build.locator('summary[aria-label="Save and manage thread notifications"]');
    await library.click();
    await submit(lane, await visible(build.getByRole("button", { name: "Save this post" })), "/api/library", 200);
    await library.click();
    await lane.getByLabel("Your reply", { exact: true }).fill(replyBody);
    await submit(lane, lane.locator("form").filter({ has: lane.getByLabel("Your reply", { exact: true }) })
      .getByRole("button", { name: "Reply", exact: true }), "/api/social/comments", 200);
    await visible(lane.getByText(replyBody, { exact: true }));
    const repost = await visible(build.getByRole("button", { name: "Repost", exact: true }));
    await submit(lane, repost, "/api/social/repost", 200);
    await lane.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await repost.getAttribute("aria-pressed"), "true");
    await load(lane, origin, "/?tab=following");
    await visible(article(lane, author).getByRole("link", { name: reviewer, exact: true }));
    await load(lane, origin, "/playbook?tab=posts");
    await visible(lane.getByRole("main").locator(`a[href="${buildPath}"]`).first());
    await load(lane, origin, buildPath);
    await (await visible(build.locator('summary[aria-label="Post options"]'))).click();
    await (await visible(build.locator('summary[aria-label="Quote post"]'))).click();
    await lane.getByRole("textbox", { name: "Your comment", exact: true }).fill(quoteBody);
    const quote = await submit(lane, lane.getByRole("button", { name: "Publish quote", exact: true }), "/api/social/quote", 201);
    assert.equal(quote.status, "visible");
    quotePath = `/post/${quote.postId}`;
    await lane.waitForURL(url => url.pathname === quotePath);
    const retry = await localPost(lane, origin, "/api/social/quote", quote.submitted, 201);
    assert.equal(retry.postId, quote.postId);
    await load(visitor, origin, quotePath);
    const quoted = await visible(article(visitor, reviewer));
    await visible(quoted.getByText(quoteBody, { exact: true }));
    const source = await visible(quoted.getByRole("link", { name: new RegExp(`^Original post by ${author}`) }));
    assert.equal(await source.getAttribute("href"), buildPath);
    await screenshot(visitor, "04-native-quote-mobile.png");
  });

  await check("An author closes and reopens new replies without removing the conversation", async () => {
    await load(river, origin, buildPath);
    const options = article(river, author).locator('summary[aria-label="Post options"]');
    await (await visible(options)).click();
    const closed = await submit(river, river.getByRole("button", { name: "Close replies", exact: true }), "/api/social/reply-policy", 200);
    assert.equal(closed.closed, true);
    await load(lane, origin, buildPath);
    const notice = await visible(lane.getByText("The author closed new replies.", { exact: true }));
    await visible(lane.getByText(replyBody, { exact: true }));
    assert.equal(await lane.getByLabel("Your reply", { exact: true }).count(), 0);
    await localPost(lane, origin, "/api/social/comments", { postId: buildId, body: "Is a new reply allowed?" }, 400);
    await localPost(lane, origin, "/api/social/reply-policy", { postId: buildId, closed: false }, 404);
    await notice.scrollIntoViewIfNeeded();
    await screenshot(lane, "04b-closed-replies-desktop.png");
    await load(river, origin, buildPath);
    await (await visible(options)).click();
    const reopened = await submit(river, river.getByRole("button", { name: "Reopen replies", exact: true }), "/api/social/reply-policy", 200);
    assert.equal(reopened.closed, false);
    await load(lane, origin, buildPath);
    await visible(lane.getByLabel("Your reply", { exact: true }));
    await visible(lane.getByText(replyBody, { exact: true }));
  });

  await check("A verified player opens the objective timeline and publishes from the exact match", async () => {
    await load(river, origin, "/search");
    const riotSearch = await visible(searchBox(river));
    await riotSearch.fill(identity);
    await riotSearch.press("Enter");
    const target = new URL(playerPath, origin);
    await river.waitForURL(url => url.pathname === target.pathname && url.searchParams.get("riotId") === identity);
    const match = river.locator(`#match-${matchId}`);
    const sourceStats = await match.getByText("6 kills, 2 deaths, 7 assists", { exact: true }).textContent();
    assert.equal(await match.getByRole("region", { name: "Objective timeline" }).count(), 0);
    await match.locator("summary").filter({ hasText: "Match details" }).click();
    const timelineLink = await visible(match.getByRole("link", { name: "View objective timeline", exact: true }));
    await timelineLink.click();
    await river.waitForURL(url => url.searchParams.get("timeline") === "objectives" && url.searchParams.get("match") === matchId && url.hash === `#match-${matchId}`);
    const timeline = await visible(match.getByRole("region", { name: "Objective timeline" }));
    await visible(timeline.getByRole("listitem").filter({ hasText: /12:34.*Dragon.*Blue team/i }));
    await visible(timeline.getByRole("listitem").filter({ hasText: /24:15.*Baron Nashor/i }));
    await timeline.scrollIntoViewIfNeeded();
    await screenshot(river, "05a-objective-timeline-mobile.png");
    await (await visible(match.getByRole("link", { name: /Back to (the )?(selected )?match/ }))).click();
    await river.waitForURL(url => url.pathname === "/player" && url.searchParams.get("match") === matchId && !url.searchParams.has("timeline") && url.hash === `#match-${matchId}`);
    assert.equal(await match.getByRole("region", { name: "Objective timeline" }).count(), 0);
    await (await visible(match.getByRole("link", { name: "Discuss this match", exact: true }))).click();
    await river.waitForURL(url => url.pathname === "/questions/new");
    await visible(river.getByRole("region", { name: "Public match preview" }).getByText(/your verified Riot account/));
    await river.getByRole("textbox", { name: "Your question", exact: true }).fill(matchBody);
    await river.getByRole("checkbox", { name: "Attach this public match to my post.", exact: true }).check();
    const saved = await submit(river, river.getByRole("button", { name: "Post discussion", exact: true }), "/api/questions", 201);
    assert.equal(saved.status, "visible");
    discussionPath = `/post/${saved.postId}`;
    await river.waitForURL(url => url.pathname === discussionPath);
    await visible(river.getByRole("region", { name: "Public match", exact: true }).getByText(/Player verified at posting/));
    await river.getByRole("link", { name: "View match", exact: true }).click();
    await river.waitForURL(url => url.pathname === "/player" && url.hash === `#match-${matchId}`);
    assert.equal(await match.getByText(sourceStats, { exact: true }).textContent(), sourceStats);
    await river.getByRole("link", { name: "Match discussions", exact: true }).click();
    await river.waitForURL(url => url.pathname === "/u/551" && url.searchParams.get("tab") === "discussions");
    await visible(river.getByText(matchBody));
    const discussionLink = await visible(river.locator(`a[href="${discussionPath}"]`).first());
    await discussionLink.scrollIntoViewIfNeeded();
    await screenshot(river, "05-profile-discussions-mobile.png");
    await discussionLink.click();
    await river.waitForURL(url => url.pathname === discussionPath);
  });

  await check("A helpful answer connects the profile thread to a persistent progress follow-up", async () => {
    await load(lane, origin, discussionPath);
    const reply = lane.getByLabel("Your reply", { exact: true });
    await reply.fill(answerBody);
    const sent = await submit(lane, lane.locator("form").filter({ has: reply }).getByRole("button", { name: "Reply", exact: true }),
      "/api/social/comments", 200);
    await load(river, origin, discussionPath);
    await river.getByLabel("Choose a helpful reply").selectOption(String(sent.commentId));
    await submit(river, river.getByRole("button", { name: "Save helpful answer", exact: true }), "/api/questions", 200);
    await load(river, origin, "/playbook?tab=progress");
    const entry = river.getByRole("heading", { name: matchBody, exact: true }).locator("..");
    const followUp = await visible(entry.getByRole("link", { name: "Log what happened", exact: true }));
    assert.equal(await followUp.getAttribute("href"), `${discussionPath}#decision-follow-up`);
    await followUp.click();
    await river.waitForURL(url => url.pathname === discussionPath && url.hash === "#decision-follow-up");
    await river.getByLabel("How did it go?").selectOption("helped");
    await submit(river, river.getByRole("button", { name: "Share follow-up", exact: true }), "/api/questions", 200);
    await load(river, origin, "/playbook?tab=progress");
    await visible(entry.getByText(/It helped/));
    await screenshot(river, "06-follow-up-mobile.png");
  });

  await check("A block suppresses the source and a withdrawal removes its quoted preview", async () => {
    await localPost(river, origin, "/api/social/block", { userId: reviewerId, block: true }, 200);
    await withoutPost(lane, origin, buildPath, buildBody);
    await withoutPost(lane, origin, quotePath, quoteBody);
    await load(lane, origin, "/search?scope=builds&q=Nami");
    assert.equal(await lane.getByText(buildBody, { exact: true }).count(), 0);
    await load(lane, origin, "/playbook?tab=posts");
    assert.equal(await lane.getByRole("main").locator(`a[href="${buildPath}"]`).count(), 0);
    await load(visitor, origin, buildPath);
    await visible(postBody(article(visitor, author), buildBody));
    await load(visitor, origin, quotePath);
    const quoted = await visible(article(visitor, reviewer));
    await visible(quoted.getByText("Original post unavailable", { exact: true }));
    await localPost(river, origin, "/api/social/withdraw", { kind: "post", id: buildId }, 200);
    await withoutPost(visitor, origin, buildPath, buildBody);
    await load(visitor, origin, quotePath);
    await visible(quoted.getByText("Original post unavailable", { exact: true }));
    assert.equal(await quoted.locator(`a[href="${buildPath}"]`).count(), 0);
    assert.equal(await quoted.getByText(buildBody, { exact: true }).count(), 0);
    await visible(quoted.getByText(quoteBody, { exact: true }));
    const html = await (await visitor.request.get(origin + quotePath)).text();
    assert.ok(!html.includes(buildBody), "The original content stays out of quote metadata and serialized data");
    await screenshot(visitor, "07-quote-after-withdrawal-mobile.png");
    await load(visitor, origin, "/search?scope=builds&q=Nami");
    assert.equal(await visitor.getByText(buildBody, { exact: true }).count(), 0);
  });

  assert.deepEqual(clientErrors, []);
  await writeFile(join(output, "verification.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`${report.checks.length} community workflow browser checks passed.`);
} catch (error) {
  console.error(fixture.output());
  throw error;
} finally {
  await browser?.close();
  await fixture.stop();
}
