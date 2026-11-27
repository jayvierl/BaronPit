import assert from "node:assert/strict";

function matchRows(html) {
  return [...html.matchAll(/<div\b[^>]*\bid="match-([\w-]+)"[^>]*>/g)].map(([,id]) => id);
}

export async function checkMatchFilters(journey, playerUrl) {
  const filter = new URL(playerUrl, "http://fixture.invalid");
  filter.searchParams.set("queue", "400");
  filter.searchParams.set("champion", "Nami");
  const loss = await journey(filter.pathname + filter.search, {html:true});
  const playerIcon = (loss.match(/<img\b[^>]*>/g) ?? []).find(image => image.includes("profileicon"));
  assert.ok(playerIcon?.includes("/_next/image?") && /\bfetchpriority="high"/i.test(playerIcon), "The player icon should be resized and discoverable in the initial HTML");
  const summary = html => html.match(/<p[^>]*aria-live="polite"[^>]*>([\s\S]*?)<\/p>/)?.[1].replace(/<[^>]+>/g,"") ?? "";
  const record = summary(loss);
  for (const sample of ["3 public games", "0W–1L", "0% win rate"]) assert.ok(record.includes(sample), record);
  assert.deepEqual(matchRows(loss), ["NA1_777002"], "normal Nami match appears without ranked Nami or Flex Vi");
  const formLink = loss.match(/<a\b[^>]*\bhref="([^"#]+#match-NA1_999999)"/);
  const unfiltered = new URL(formLink?.[1].replaceAll("&amp;", "&") ?? "/", filter);
  assert.equal(unfiltered.pathname, "/player");
  assert.equal(unfiltered.searchParams.get("riotId"), filter.searchParams.get("riotId"));
  assert.equal(unfiltered.searchParams.has("queue") || unfiltered.searchParams.has("champion"), false);
  assert.ok(loss.includes('data-tier="PLATINUM"') && loss.includes('16W'), "rank and season stats stay intact");
  filter.searchParams.set("champion", "Vi");
  const noMatches = await journey(filter.pathname + filter.search, {html:true});
  assert.ok(summary(noMatches).includes("No matching games"));
  assert.deepEqual(matchRows(noMatches), []);
  assert.match(noMatches, /Clear filters/);
}
