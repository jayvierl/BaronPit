import assert from "node:assert/strict";

export async function checkMatchFilters(journey, playerUrl) {
  const filter = new URL(playerUrl, "http://fixture.invalid");
  filter.searchParams.set("queue", "400");
  filter.searchParams.set("champion", "Nami");
  const loss = await journey(filter.pathname + filter.search, {html:true});
  const summary = html => html.match(/<p[^>]*aria-live="polite"[^>]*>([\s\S]*?)<\/p>/)?.[1].replace(/<[^>]+>/g,"") ?? "";
  const record = summary(loss);
  for (const sample of ["3 games", "0W–1L", "0% win rate"]) assert.ok(record.includes(sample), record);
  assert.ok(loss.includes("NA1_777002") && !loss.includes("NA1_999999") && !loss.includes("NA1_777001"),
    "normal Nami match appears without ranked Nami or Flex Vi");
  assert.ok(loss.includes('data-tier="PLATINUM"') && loss.includes('16W'), "rank and season stats stay intact");
  filter.searchParams.set("champion", "Vi");
  const noMatches = await journey(filter.pathname + filter.search, {html:true});
  assert.ok(summary(noMatches).includes("No matching games") && !noMatches.includes("NA1_777002"));
  assert.match(noMatches, /Clear filters/);
}
