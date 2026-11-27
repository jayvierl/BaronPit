import assert from "node:assert/strict";
import { account, fixtureContext, load, submit, visible } from "./browser-helpers.mjs";
import { startFixtureServer } from "./fixture-server.mjs";

const { chromium, webkit } = await import(process.env.SMOKE_PLAYWRIGHT_MODULE || "playwright");
const engine = process.argv[2] ?? "chromium";
assert.ok(["chromium", "webkit"].includes(engine), "Choose chromium or webkit");
const riotId = "Jade Lantern#TEST";
const getOption = (page, text) => page.getByRole("option").filter({ hasText: text });

async function swipeOptions(page, field) {
  await field.pressSequentially("sword", { delay: 45 });
  const menu = await visible(page.getByRole("listbox"));
  const scrollArea = menu.locator("..");
  const area = await scrollArea.boundingBox();
  assert.ok(area && area.height > 36);
  const x = area.x + area.width / 2;
  const y = area.y + area.height - 14;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (const offset of [15, 35, 50, 65]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - offset }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => document.querySelector('[role="listbox"]')?.parentElement.scrollTop > 0);
    assert.equal(await field.inputValue(), "sword", "A swipe should scroll without selecting a tag");
  } finally {
    await cdp.detach();
  }
  await field.fill("");
}

async function highlightedChampion(page, field) {
  await field.tap();
  await field.pressSequentially("Who ashe", { delay: 85 });
  const ashe = page.getByRole("option").filter({ has: page.getByText("Ashe", { exact: true }) });
  await visible(ashe);
  // iOS text selection leaves the caret at the start of the highlighted word.
  // Exercise real selection events before tapping, as happens after a long press.
  if (engine === "chromium") await field.dblclick({ position: { x: 75, y: 18 } });
  else for (let i = 0; i < 4; i++) await field.press("Shift+ArrowLeft");
  assert.deepEqual(await field.evaluate(el => [el.selectionStart, el.selectionEnd]), [4, 8]);
  await ashe.tap();
  assert.equal((await field.inputValue()).trimEnd(), "Who Ashe");
  assert.equal(await page.getByRole("listbox").count(), 0);
}

async function taggedPerson(page, field) {
  await field.press("@");
  await visible(page.getByRole("option").first());
  await field.pressSequentially("Jade", { delay: 45 });
  const option = getOption(page, riotId);
  await visible(option);
  await option.tap();
  assert.ok((await field.inputValue()).includes("@" + riotId));
}

async function verifyPlayerLink(scope) {
  const link = scope.getByRole("link").filter({ hasText: riotId });
  const url = new URL(await (await visible(link)).getAttribute("href"), "https://fixture.invalid");
  assert.equal(url.pathname, "/player");
  assert.equal(url.searchParams.get("riotId"), riotId);
  assert.equal(url.searchParams.get("platform"), "na1");
  assert.equal(url.searchParams.get("via"), "mention");
  assert.match(url.searchParams.get("playerKey") ?? "", /^[0-9a-f]{32}$/);
  return link;
}

const fixture = await startFixtureServer({ demo: "workflows" });
let browser;
try {
  browser = engine === "webkit" ? await webkit.launch()
    : await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined });
  const context = await fixtureContext(browser, fixture.origin, 390, true, true, true);
  await account(context, fixture.origin, fixture.session);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 390, height: 520 });
  await load(page, fixture.origin, "/post/521");
  const reply = page.getByLabel("Your reply", { exact: true });
  const sendReply = page.locator("form").filter({ has: reply }).getByRole("button", { name: "Reply", exact: true });
  await highlightedChampion(page, reply);
  await taggedPerson(page, reply);
  const root = await submit(page, sendReply, "/api/social/comments", 200);
  await page.reload();
  const row = page.locator("#reply-" + root.commentId);
  await visible(row.locator('a[href="/champions/Ashe"]'));
  await verifyPlayerLink(row);

  await reply.tap();
  if (engine === "chromium") await swipeOptions(page, reply);
  await row.getByRole("button", { name: /^Reply to / }).tap();
  await visible(page.getByText(/Replying to Demo River/));
  await reply.pressSequentially("Try ashe", { delay: 45 });
  await getOption(page, /Fated Ashes/i).tap();
  assert.equal((await reply.inputValue()).trimEnd(), "Try Fated Ashes");
  const child = await submit(page, sendReply, "/api/social/comments", 200);
  assert.equal(child.submitted.parentId, root.commentId);
  await page.goto(fixture.origin + "/post/521#reply-" + child.commentId);
  await page.reload();
  await visible(page.locator("#reply-" + child.commentId).locator('a[href="/items/2508"]'));

  await load(page, fixture.origin, "/");
  await page.locator("summary").filter({ hasText: /Post to the Pit/ }).first().tap();
  const post = page.getByLabel("Post text", { exact: true });
  await post.tap();
  await post.pressSequentially("Try Needlessly", { delay: 45 });
  await visible(getOption(page, "Needlessly Large Rod"));
  await post.press("Enter");
  assert.equal((await post.inputValue()).trimEnd(), "Try Needlessly Large Rod");
  await taggedPerson(page, post);
  const published = await submit(page, page.locator("fieldset").filter({ has: post })
    .getByRole("button", { name: "Post", exact: true }), "/api/social/post", 200);
  await page.getByRole("link", { name: "View thread", exact: true }).tap();
  await page.waitForURL(url => url.pathname === "/post/" + published.postId);
  await page.reload();
  const body = page.locator("article p.post-body").first();
  await visible(body.locator('a[href="/items/1058"]'));
  const playerLink = await verifyPlayerLink(body);
  assert.doesNotMatch(await body.innerText(), /\[\[/);
  await playerLink.tap();
  await visible(page.getByRole("heading", { name: /Jade Lantern.*#TEST/ }));
  console.log("PASS " + engine + ": selected word, touch options, keyboard selection, post, root reply, nested reply and persistent Riot ID links");
} finally {
  await browser?.close();
  await fixture.stop();
}
