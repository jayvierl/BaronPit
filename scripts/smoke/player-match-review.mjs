import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { capture, fixtureContext, load, openFixtureBrowser, visible } from "./browser-helpers.mjs";
import { startFixtureServer } from "./fixture-server.mjs";
import { depthMatchId, depthName, depthTag } from "./profile-depth-fixture.mjs";

const riotId = depthName + "#" + depthTag;
const screenshotDir = process.env.SMOKE_SCREENSHOTS;

async function checkCatalog(page, origin, activate) {
  await load(page, origin, "/search");
  await activate(page.getByRole("navigation", { name: "Search categories" }).getByRole("link", { name: "Game data" }));
  await activate(page.getByRole("link", { name: /Browse items/ }));
  await visible(page.getByRole("heading", { name: "Items", exact: true }));
  await activate(page.getByRole("navigation", { name: "Item pages" }).getByRole("link", { name: /Next/ }));
  await page.waitForURL(url => url.pathname === "/items" && url.searchParams.get("page") === "2");
  const first = page.locator("main ul a").first();
  const detail = new URL(await first.getAttribute("href"), origin);
  assert.equal(detail.searchParams.get("from"), "/items?page=2");
  await activate(first);
  await page.waitForURL(url => url.pathname === detail.pathname);
  await activate(page.getByRole("link", { name: /Back to items/ }));
  await page.waitForURL(url => url.pathname === "/items" && url.searchParams.get("page") === "2");
  for (const [id, name] of [["3009", "Boots of Swiftness"], ["6631", "Stridebreaker"]]) {
    await page.getByRole("searchbox", { name: "Item name or ID" }).fill(id);
    await activate(page.getByRole("button", { name: "Apply" }));
    await activate(page.getByRole("link", { name: new RegExp(name) }));
    await page.waitForURL(url => url.pathname === "/items/" + id);
    await visible(page.getByRole("heading", { name, exact: true }));
    await activate(page.getByRole("link", { name: /Back to items/ }));
    await page.waitForURL(url => url.pathname === "/items" && url.searchParams.get("q") === id);
  }
}

const fixture = await startFixtureServer();
let browser;
try {
  browser = await openFixtureBrowser();
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  for (const width of [1440, 390]) {
    const phone = width === 390;
    const context = await fixtureContext(browser, fixture.origin, width, true, phone, phone);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const activate = locator => phone ? locator.tap() : locator.press("Enter");
    const match = index => page.locator("#match-" + depthMatchId(index));
    await load(page, fixture.origin, "/search");
    await activate(page.getByRole("navigation", { name: "Search categories" }).getByRole("link", { name: "Player stats" }));
    const search = await visible(page.getByRole("combobox", { name: "Player name or Riot ID" }));
    await page.getByRole("combobox", { name: "League region" }).selectOption("na1");
    await search.fill(riotId);
    await search.press("Enter");
    await page.waitForURL(url => url.pathname === "/player" && url.searchParams.get("riotId") === riotId);
    await visible(page.getByRole("heading", { name: riotId }));
    const quick = page.getByRole("navigation", { name: "Quick queue filters" });
    await activate(quick.getByRole("link", { name: "Ranked", exact: true }));
    await page.waitForURL(url => url.searchParams.get("queue") === "ranked");

    const first = match(0);
    const unrated = match(2);
    await visible(first.getByLabel("Baron Match Rating 8.3 out of 10", { exact: true }).first());
    await visible(first.getByText("MVP", { exact: true }).first());
    await visible(first.getByText("65% KP", { exact: true }));
    await visible(first.getByText("58 vision", { exact: true }));
    await visible(match(1).getByText("Duration 17m 31s", { exact: true }));
    await visible(match(1).getByText("Played 7h ago", { exact: true }));
    await visible(unrated.getByText("Not rated", { exact: true }).first());
    await visible(unrated.getByText(/no current rating evidence/));
    assert.equal(await unrated.locator("[aria-label^='Baron Match Rating']").count(), 0);
    const inventory = first.getByRole("list", { name: "Final inventory", exact: true });
    await visible(inventory.getByRole("link", { name: /Ionian Boots of Lucidity/ }));
    if (screenshotDir) {
      await first.evaluate(el => el.scrollIntoView({ block: "start" }));
      await capture(page, join(screenshotDir, "ranked-matches-" + width + ".png"));
    }
    await activate(first.locator("summary").first());
    await visible(first.getByText("Why this score?", { exact: true }));
    await visible(first.getByText(/65% vs 35%/));
    for (const team of ["Allied team", "Opposing team"]) {
      const list = first.getByRole("heading", { name: team }).locator("..").getByRole("list");
      assert.equal(await list.getByRole("listitem").count(), 5);
      assert.equal(await list.locator("[aria-label^='Baron Match Rating']").count(), 5);
      if (team === "Allied team") {
        assert.equal(await list.getByText("MVP", { exact: true }).count(), 1);
        assert.equal(await list.getByLabel("Baron Match Rating 8.3 out of 10", { exact: true }).count(), 2);
        const selected = list.getByRole("listitem").filter({ hasText: "Looked-up player" });
        await visible(selected.getByText("MVP", { exact: true }));
      } else {
        assert.equal(await list.getByText("Shared Team Ace", { exact: true }).count(), 2);
      }
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.equal(overflow, 0, "Expanded match must fit the viewport at " + width);
    if (screenshotDir) {
      await first.getByRole("heading", { name: "Allied team" }).evaluate(el => {
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, -(document.querySelector("header")?.getBoundingClientRect().height || 64) - 8);
      });
      await capture(page, join(screenshotDir, "scoreboard-" + width + ".png"));
    }

    const member = first.getByRole("link", { name: "Fixture Archer#NA1" });
    await activate(member);
    await visible(page.getByRole("heading", { name: "Fixture Archer#NA1" }));
    await activate(page.getByRole("link", { name: /Back to previous player/ }));
    await page.waitForURL(url => url.searchParams.get("queue") === "ranked" && url.hash === "#match-" + depthMatchId(0));
    await activate(quick.getByRole("link", { name: "All", exact: true }));
    await page.waitForURL(url => !url.searchParams.has("queue"));
    await activate(page.locator("#older-games > summary"));
    await visible(match(3).getByText("Not rated", { exact: true }));
    await visible(match(3).getByText(/Only ranked Solo\/Duo and Flex games are rated/));
    assert.ok(await match(3).getByText(/Normal Draft/).isVisible());
    await checkCatalog(page, fixture.origin, activate);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px player search, ranked and unrated rows, ten-player scores, exact-match return and paged item browsing`);
  }
} finally {
  await browser?.close();
  await fixture.stop();
}
