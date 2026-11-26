import assert from "node:assert/strict";
import { checkMatchFilters } from "./match-filters.mjs";

function visibleText(markup) {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function linkFrom(html, name) {
  for (const anchor of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    if (!name.test(visibleText(anchor[2]))) continue;
    const path = anchor[1].match(/\bhref="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    assert.match(path ?? "", /^\/(?!\/)/, "Expected an internal link for " + name);
    return path;
  }
  assert.fail("Missing rendered link " + name);
}

function checkStats(html, markers) {
  const section = html.match(/<section\b[^>]*aria-label="League stats"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(section, "Expected rendered League stats");
  const text = visibleText(section);
  for (const marker of markers) assert.ok(text.includes(marker), "League stats missing " + marker + " in " + text);
}

function sameLookup(a, b) {
  const canonical = (path) => {
    const url = new URL(path, "http://fixture.invalid");
    assert.equal(url.pathname, "/player");
    url.searchParams.sort();
    return url.search;
  };
  assert.equal(canonical(a), canonical(b));
}

export async function checkPlayerProfiles(journey) {
  // The ranked queue, the weighted combined record and the all-queue match sample
  // intentionally disagree. Following the HTML links also catches incomplete Riot IDs.
  const verifiedStats = [
    "Platinum III · 64 LP", "Ranked Solo/Duo", "Ranked games 20", "Win rate 80%", "16W · 4L",
    "30 games", "57% win rate", "17W · 13L",
    "Last 3 games · all queues", "Most played role Support (2 games)", "Nami (2 games)", "Vi (1 game)",
  ];
  for (const session of [false, true]) {
    const options = { html: true, session };
    const unlinked = await journey("/u/501?tab=stats", options);
    assert.equal(linkFrom(unlinked, session ? /^Link a Riot ID$/ : /^Look up a Riot ID$/), session ? "/me" : "/player");
    const feed = await journey("/", options);
    const verified = await journey(linkFrom(feed, /^Fixture Other$/), options);
    assert.match(verified, /Verified Riot link/);
    const statsTab = await journey(linkFrom(verified, /^Player stats$/), options);
    checkStats(statsTab, verifiedStats);
    assert.match(verified, /data-tier="PLATINUM"/);
    checkStats(await journey("/u/504?tab=players", options), verifiedStats);

    const history = linkFrom(statsTab, /match history/i);
    sameLookup(linkFrom(feed, /^Platinum III · Nami main$/), history);
    const lookup = await journey(history, options);
    checkStats(lookup, verifiedStats);
    if (!session) await checkMatchFilters(journey, history);
    assert.match(lookup, /Fixture Support/);

    const claim = await journey(linkFrom(feed, /^Fixture Teammate$/), options);
    assert.match(claim, /Unverified Riot link/);
    assert.match(claim, /Fixture win condition/);
    assert.doesNotMatch(claim, /aria-label="League stats"/);
    const replies = await journey(linkFrom(claim, /^Replies$/), options);
    assert.match(replies, /Fixture followup/);
    assert.equal(linkFrom(replies, /View conversation/), "/post/521#reply-531");
    const claimStats = await journey(linkFrom(claim, /^Player stats$/), options);
    assert.match(claimStats, /Unverified Riot link/);
    assert.doesNotMatch(claimStats, /aria-label="League stats"/);
    const teammate = linkFrom(lookup, /^Fixture Archer#NA1$/);
    sameLookup(linkFrom(claim, /View stats for Fixture Archer#NA1/), teammate);
    const legacy = await journey(teammate, options);
    checkStats(legacy, [
      "Gold IV · 23 LP", "Ranked Solo/Duo", "Ranked games 100", "Win rate 62%", "62W · 38L",
      "Last 1 game · all queues", "Most played role Bot (1 game)", "Ashe (1 game)",
    ]);
    assert.doesNotMatch(legacy, /Across Solo\/Duo and Flex/);
    sameLookup(linkFrom(legacy, /^Fixture Support#WAVE$/), history);
  }
}
