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

function sectionFrom(html, label) {
  const start = [...html.matchAll(/<section\b[^>]*\baria-label="([^"]+)"[^>]*>/g)].find(tag => tag[1] === label);
  assert.ok(start, "Missing section " + label);
  const rest = html.slice(start.index + start[0].length);
  let depth = 1;
  for (const tag of rest.matchAll(/<\/?section\b[^>]*>/g)) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return rest.slice(0, tag.index);
  }
  assert.fail("Unclosed section " + label);
}

function checkMarkers(markup, markers, label) {
  const text = visibleText(markup);
  for (const marker of markers) assert.ok(text.includes(marker), `${label} missing ${marker} in ${text}`);
}

function checkStats(html, { queues, recent, combined }) {
  const section = sectionFrom(html, "League stats");
  assert.match(section, /Riot snapshot ·\s*<time datetime="[^"]+">[^<]+ UTC<\/time>/i);
  const visibleQueues = [...section.matchAll(/<section\b[^>]*\baria-label="([^"]+)"[^>]*>/g)].map(tag => tag[1]);
  assert.deepEqual(visibleQueues, Object.keys(queues));
  for (const [queue, markers] of Object.entries(queues)) checkMarkers(sectionFrom(section, queue), markers, queue);
  const totals = section.match(/<details\b[^>]*>\s*<summary>Combined ranked record<\/summary>([\s\S]*?)<\/details>/)?.[1];
  if (combined) {
    assert.ok(totals, "Missing combined ranked record");
    checkMarkers(totals, combined, "Combined ranked record");
  } else {
    assert.doesNotMatch(section, /Combined ranked record|Across Solo\/Duo and Flex/);
  }
  checkMarkers(section, recent, "Recent games");
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
  const verifiedStats = {
    queues: {
      "Ranked Solo/Duo": ["Platinum III · 64 LP", "Ranked games 20", "Win rate 80%", "16W · 4L"],
      "Ranked Flex": ["Silver IV · 11 LP", "Ranked games 10", "Win rate 10%", "1W · 9L"],
    },
    combined: ["Across Solo/Duo and Flex", "30 games", "57% win rate", "17W · 13L"],
    recent: ["Last 3 games · all queues", "Most played role Support (2 games)", "Nami (2 games)", "Vi (1 game)"],
  };
  for (const session of [false, true]) {
    const options = { html: true, session };
    const unlinkedDefault = await journey("/u/501", options);
    assert.equal(linkFrom(unlinkedDefault, session ? /^Link a Riot ID$/ : /^Look up a player$/), session ? "/me" : "/player");
    assert.doesNotMatch(unlinkedDefault, /aria-label="League overview"/);
    const unlinked = await journey("/u/501?tab=stats", options);
    assert.equal(linkFrom(unlinked, session ? /^Link a Riot ID$/ : /^Look up a Riot ID$/), session ? "/me" : "/player");
    const feed = await journey("/", options);
    const verified = await journey(linkFrom(feed, /^Fixture Other$/), options);
    assert.match(verified, /Verified Riot link/);
    const overview = sectionFrom(verified, "League overview");
    checkMarkers(overview, ["Ranked Solo/Duo", "Platinum III · 64 LP", "80% win rate", "Ranked Flex", "Silver IV · 11 LP", "10% win rate", "Last 3 games · all queues", "Top role Support · 2 games", "Top champion Nami · 2 games"], "League overview");
    assert.equal(visibleText(overview).match(/Last 3 games · all queues/g)?.length, 1);
    const form = sectionFrom(overview, "Recent form");
    assert.match(form, /aria-label="W · Victory on Nami, game 1"/);
    assert.match(form, /aria-label="L · Defeat on Nami, game 2"/);
    const match = linkFrom(form, /^W$/);
    const matchAnchor = new URL(match, "http://fixture.invalid").hash;
    assert.equal(matchAnchor, "#match-NA1_999999");
    const statsTab = await journey(linkFrom(verified, /^Player stats$/), options);
    checkStats(statsTab, verifiedStats);
    assert.match(verified, /data-tier="PLATINUM"/);
    checkStats(await journey("/u/504?tab=players", options), verifiedStats);

    const history = linkFrom(statsTab, /match history/i);
    assert.equal(linkFrom(overview, /View all player stats/), "/u/504?tab=stats");
    sameLookup(linkFrom(overview, /View match history/), history);
    sameLookup(match, history);
    sameLookup(linkFrom(feed, /^Platinum III · Nami main$/), history);
    const lookup = await journey(match, options);
    checkStats(lookup, verifiedStats);
    assert.match(lookup, /id="match-NA1_999999" tabindex="-1"/i);
    assert.match(sectionFrom(lookup, "Recent form"), /href="#match-NA1_999999"/);
    if (!session) await checkMatchFilters(journey, history);
    assert.match(lookup, /Fixture Support/);

    const claim = await journey(linkFrom(feed, /^Fixture Teammate$/), options);
    assert.match(claim, /Unverified Riot link/);
    assert.match(claim, /Fixture win condition/);
    assert.doesNotMatch(claim, /aria-label="League (?:stats|overview)"/);
    const replies = await journey(linkFrom(claim, /^Replies$/), options);
    assert.match(replies, /Fixture followup/);
    assert.equal(linkFrom(replies, /View conversation/), "/post/521#reply-531");
    const claimStats = await journey(linkFrom(claim, /^Player stats$/), options);
    assert.match(claimStats, /Unverified Riot link/);
    assert.doesNotMatch(claimStats, /aria-label="League stats"/);
    const teammate = linkFrom(lookup, /^Fixture Archer#NA1$/);
    sameLookup(linkFrom(claim, /View stats for Fixture Archer#NA1/), teammate);
    const legacy = await journey(teammate, options);
    checkStats(legacy, {
      queues: { "Ranked Solo/Duo": ["Gold IV · 23 LP", "Ranked games 100", "Win rate 62%", "62W · 38L"] },
      recent: ["Last 1 game · all queues", "Most played role Bot (1 game)", "Ashe (1 game)"],
    });
    sameLookup(linkFrom(legacy, /^Fixture Support#WAVE$/), history);
  }
}
