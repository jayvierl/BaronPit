import assert from "node:assert/strict";

export async function openFixtureBrowser() {
  const { chromium } = await import(process.env.SMOKE_PLAYWRIGHT_MODULE || "playwright");
  return chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined });
}

export async function fixtureContext(browser, origin, width, javaScriptEnabled = true) {
  const context = await browser.newContext({
    viewport: { width, height: width < 800 ? 844 : 960 },
    colorScheme: "light", reducedMotion: "reduce", javaScriptEnabled,
  });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || (url.pathname === "/_next/image" && /^https?:/.test(url.searchParams.get("url") ?? ""))) {
      return route.abort();
    }
    return route.continue();
  });
  return context;
}

export async function visible(locator) {
  await locator.waitFor({ state: "visible" });
  return locator;
}

export async function load(page, origin, path) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin, "The demo only navigates to its local fixture");
  const response = await page.goto(url.href, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, url.pathname);
}

export async function localPost(page, origin, path, data, expected) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin, "The demo only sends requests to its local fixture");
  const response = await page.request.post(url.href, { data, headers: { origin }, maxRedirects: 0 });
  const body = await response.json();
  assert.equal(response.status(), expected, `${path} returned ${JSON.stringify(body)}`);
  return body;
}

export async function submit(page, button, apiPath, status) {
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === apiPath && response.request().method() === "POST"),
    button.click(),
  ]);
  const body = await response.json();
  assert.equal(response.status(), status, `${apiPath} returned ${JSON.stringify(body)}`);
  assert.equal(body.ok, true);
  return { ...body, submitted: response.request().postDataJSON() };
}

export async function account(context, origin, session) {
  await context.addCookies([{ name: "wp_session", value: session, url: origin, httpOnly: true }]);
}

export async function capture(page, path) {
  const width = page.viewportSize().width;
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, path + " has horizontal overflow");
  await page.screenshot({ path, animations: "disabled" });
}
