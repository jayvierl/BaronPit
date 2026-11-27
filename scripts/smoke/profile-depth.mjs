import assert from "node:assert/strict";
import { depthMatchId, depthName, depthTag } from "./profile-depth-fixture.mjs";

const profile = "/player?" + new URLSearchParams({ platform: "na1", riotId: `${depthName}#${depthTag}` });
const markers = (html, words) => {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const word of words) assert.ok(text.includes(word), "Deep player profile missing " + word);
};
const matchRows = html => [...html.matchAll(/\bid="match-(NA1_\d+)"/g)].map(([, id]) => id);
const matchIds = (start, end) => Array.from({ length: end - start }, (_, index) => depthMatchId(start + index));
const renderedLink = (html, predicate) => {
  for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)) {
    const decoded = href.replaceAll("&amp;", "&");
    if (decoded.startsWith("/player?") && predicate(new URL(decoded, "https://fixture.invalid"))) return decoded;
  }
  assert.fail("Deep player profile is missing an older-history link");
};

export async function checkPlayerDepth(journey) {
  const first = await journey(profile, { html: true });
  markers(first, [
    depthName, "Level 205", "Update", "Last updated", "Gold II · 36 LP", "Silver III · 12 LP",
    "Latest 100 public games", "Latest 100 public games · 55W–45L · 55% win rate",
    "Role share", "Preferred classes", "Ranked W/L by champion · last 7 days",
    "Latest 20 games", "Previous 80 games", "75.0%", "50.0%", "+25.0 pp",
    "Kill participation", "65.0%", "Activity patterns", "Time of day", "Hour-by-hour results (UTC)",
    "Avg. match rating", "8.0", "3 rated games",
    "Champion mastery", "Nami", "109,842 points", "Level 18",
    "Show 97 games more", "Older games 1–10 of 97",
    "Summoner spells", "Flash", "Teleport", "Keystone: Press the Attack",
    "Allied team", "Opposing team", "65% P/Kill", "Ionian Boots of Lucidity",
  ]);
  assert.deepEqual(matchRows(first), matchIds(0, 13), "The first page must cap older match rows");
  assert.doesNotMatch(first, /\bdata-motion=|Ask the community about this game|Which item should I have bought|When should I have recalled|How should we play this matchup|Ask about an item/);
  assert.match(first, /How match ratings work/);
  const rows = first.split(/\bid="match-NA1_\d+"/).slice(1);
  assert.match(rows[0], /aria-label="Match rating 10 out of 10"/);
  assert.match(rows[0], />MVP<\/span>/);
  assert.match(rows[1], /aria-label="Match rating 7\.5 out of 10"/);
  assert.doesNotMatch(rows[1], />MVP<\/span>/);
  assert.doesNotMatch(rows[2], /aria-label="Match rating |\bMVP<\/span>/);
  assert.match(first, /name="force" value="1"/);
  assert.match(first, /id="rank-history-title"/);
  if (first.includes("One recorded day")) {
    const now = new Date();
    assert.equal(now.getUTCMonth(), 0);
    assert.equal(now.getUTCDate(), 1);
  } else {
    assert.match(first, /aria-label="Rank changes in Ranked Solo\/Duo from /);
    assert.match(first, /aria-label="Recorded ranks in Ranked Solo\/Duo"/);
    markers(first, ["Gold II · 19 LP", "55–44", "56–44"]);
  }
  assert.doesNotMatch(first, /aria-label="Past ranked years/);

  const nextArchive = renderedLink(first, url => url.searchParams.get("older") === "2" && url.hash === "#older-games");
  const second = await journey(nextArchive, { html: true });
  markers(second, ["Older games 11–20 of 97"]);
  assert.deepEqual(matchRows(second), [...matchIds(0, 3), ...matchIds(13, 23)]);
  const last = await journey(profile + "&older=10", { html: true });
  markers(last, ["Older games 91–97 of 97"]);
  assert.deepEqual(matchRows(last), [...matchIds(0, 3), ...matchIds(93, 100)]);
  const target = depthMatchId(99);
  const older = renderedLink(last, url => url.searchParams.get("match") === target && url.hash === "#match-" + target);
  const selected = await journey(older, { html: true, session: true });
  const detail = selected.slice(selected.indexOf(`id="match-${target}"`), selected.indexOf("</details>", selected.indexOf(`id="match-${target}"`)));
  assert.match(detail, /<details\b[^>]*\bopen=""/);
  assert.match(detail, /#match-NA1_910099|%23match-NA1_910099/);
  assert.doesNotMatch(detail, /data-motion=|Share as card/);
  markers(detail, ["50% P/Kill", "Allied team", "Opposing team", "Teleport"]);

  await journey(profile + "&force=1", { includes: ["Checked recently.", "Last updated"], excludes: ["Stats updated."] });
}
