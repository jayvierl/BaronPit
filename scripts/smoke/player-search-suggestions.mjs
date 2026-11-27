import assert from "node:assert/strict";
import { join } from "node:path";
import { capture, fixtureContext, load, visible } from "./browser-helpers.mjs";

const suggestions = "/api/search/suggestions";
const allNames = { name: "Search the community", exact: true };
const matches = (page, tag) => page.getByRole("option").filter({ hasText: "Jade Lantern#" + tag });
const playerUrl = (region, tag) => url => url.pathname === "/player" &&
  url.searchParams.get("platform") === region && url.searchParams.get("riotId") === "Jade Lantern#" + tag;

async function keyboardSearch(page, origin) {
  await load(page, origin, "/search");
  const input = await visible(page.getByRole("combobox", allNames));
  await input.pressSequentially("JA");
  const northAmerica = await visible(matches(page, "TEST"));
  await input.press("Space");
  await visible(northAmerica);
  await input.press("Backspace");
  await visible(northAmerica);
  assert.match(await northAmerica.innerText(), /North America/);
  assert.match(await (await visible(matches(page, "WEST"))).innerText(), /EU West/);
  assert.equal(await input.getAttribute("aria-activedescendant"), null);
  const index = await northAmerica.evaluate(option => Array.from(option.closest('[role="listbox"]').querySelectorAll('[role="option"]')).indexOf(option));
  for (let i = 0; i <= index; i++) await input.press("ArrowDown");
  assert.equal(await input.getAttribute("aria-activedescendant"), await northAmerica.getAttribute("id"));
  await input.press("Enter");
  await page.waitForURL(playerUrl("na1", "TEST"));
  await visible(page.getByRole("heading", { name: /Jade Lantern.*#TEST/ }));
  await page.goBack();
  await page.waitForURL(url => url.pathname === "/search");

  await input.fill("Jade");
  await visible(matches(page, "TEST"));
  await input.press("Escape");
  await page.getByRole("listbox").waitFor({ state: "hidden" });
  assert.equal(await input.inputValue(), "Jade");
  await input.press("Enter");
  await page.waitForURL(url => url.pathname === "/search" && url.searchParams.get("q") === "Jade");
  await visible(page.getByRole("heading", { name: "Riot players" }));
}

async function outOfOrder(page) {
  const input = await visible(page.getByRole("combobox", allNames));
  const gate = Promise.withResolvers();
  const older = request => {
    const url = new URL(request.url());
    return url.pathname === suggestions && url.searchParams.get("q")?.toLowerCase() === "jad";
  };
  await page.route("**/api/search/suggestions?*", async route => {
    if (!older(route.request())) return route.fallback();
    const response = await route.fetch();
    await gate.promise;
    await route.fulfill({ response });
  });
  try {
    await Promise.all([page.waitForRequest(older), input.fill("Jad")]);
    await input.fill("Fixture A");
    const archer = page.getByRole("option").filter({ hasText: "Fixture Archer#NA1" });
    await visible(archer);
    gate.resolve();
    await page.unrouteAll({ behavior: "wait" });
    await visible(archer);
    assert.equal(await matches(page, "TEST").count(), 0);
    await input.fill("UnmatchedFixtureName");
    await visible(input.locator("..").getByRole("status").filter({ hasText: "No matching names." }));
    await input.press("Enter");
    await page.waitForURL(url => url.searchParams.get("q") === "UnmatchedFixtureName");
    await visible(page.getByText(/No matches for.*UnmatchedFixtureName/).first());
  } finally {
    gate.resolve();
  }
}

export async function verifyPlayerSuggestions(browser, origin) {
  const desktop = await fixtureContext(browser, origin, 1280);
  const mobile = await fixtureContext(browser, origin, 390, true, true);
  const native = await fixtureContext(browser, origin, 390, false);
  try {
    const page = await desktop.newPage();
    await keyboardSearch(page, origin);
    await outOfOrder(page);

    const phone = await mobile.newPage();
    await phone.emulateMedia({ colorScheme: "dark" });
    await load(phone, origin, "/search");
    await phone.getByRole("combobox", allNames).fill("Ja");
    const eu = await visible(matches(phone, "WEST"));
    if (process.env.SMOKE_SCREENSHOTS) await capture(phone, join(process.env.SMOKE_SCREENSHOTS, "player-name-suggestions.png"));
    await eu.tap();
    await phone.waitForURL(playerUrl("euw1", "WEST"));
    await visible(phone.getByRole("heading", { name: /Jade Lantern.*#WEST/ }));

    await load(phone, origin, "/player");
    await phone.getByLabel("Server", { exact: true }).selectOption("euw1");
    await phone.getByRole("combobox", { name: "Riot ID", exact: true }).fill("Ja");
    await visible(matches(phone, "WEST"));
    assert.equal(await matches(phone, "TEST").count(), 0);

    const noJs = await native.newPage();
    await load(noJs, origin, "/search");
    await noJs.getByLabel(allNames.name, { exact: true }).fill("Jade");
    await noJs.getByRole("button", { name: "Search", exact: true }).click();
    await noJs.waitForURL(url => url.pathname === "/search" && url.searchParams.get("q") === "Jade");
    await visible(noJs.getByRole("link", { name: /Jade Lantern#WEST/ }));
  } finally {
    await Promise.all([desktop.close(), mobile.close(), native.close()]);
  }
}
