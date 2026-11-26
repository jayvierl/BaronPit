import assert from "node:assert/strict";

export async function checkNavigation(journey) {
  const signIn = await journey("/signin?next=%2Fprofile%2Fedit", {html:true});
  assert.match(signIn, /<p\b[^>]*>Your link will take you back to the profile editor\.<\/p>/);
  assert.match(signIn, /<input\b[^>]*type="email"/);
  await journey("/signin?mode=signup", {includes:["<h1>Create your account</h1>", 'for="age-band">Age group</label>']});
  await journey("/signin?error=expired", {includes:['role="alert"', "That link expired. Request a fresh one."]});
  const search = await journey("/search", {html:true});
  const primary = search.match(/<nav\b[^>]*aria-label="Primary"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  assert.equal((primary.match(/<a\b/g) ?? []).length, 5);
  for (const path of ["/", "/search", "/#compose", "/activity", "/lfg"]) assert.ok(primary.includes('href="' + path + '"'));
  for (const [, attrs, markup] of primary.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const text = markup.replace(/<[^>]+>/g, "").trim();
    assert.ok(text && attrs.includes('aria-label="' + text + '"'), "Navigation label must match its visible text");
  }
  const desktop = search.match(/<nav\b[^>]*aria-label="Primary desktop"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  assert.equal((desktop.match(/<a\b/g) ?? []).length, 5);
  for (const [label, path] of [["Home", "/"], ["Search", "/search"], ["Duos", "/lfg"], ["Activity", "/activity"], ["Profile", "/profile"]]) {
    assert.ok([...desktop.matchAll(/<a\b[^>]*>/g)].some(([tag]) => tag.includes(`aria-label="${label}"`) && tag.includes(`href="${path}"`)));
  }
  assert.match(desktop, /aria-label="Search" aria-current="page"/);
  const shortcuts = search.match(/<aside\b[^>]*aria-label="Site shortcuts"[^>]*>([\s\S]*?)<\/aside>/)?.[1] ?? "";
  assert.match(shortcuts, /<a\b[^>]*href="\/"[^>]*><img\b[^>]*src="\/baron-emblem-96\.webp"/);
  assert.match(search, /<a\b[^>]*aria-label="New thread"[^>]*href="\/#compose"/);
  const roomRail = search.match(/<nav\b[^>]*aria-label="Rooms"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  for (const path of ["/rooms", "/rooms/general", "/rooms/patch-meta", "/rooms/off-meta-lab", "/rooms/new-players"]) {
    assert.ok(roomRail.includes(`href="${path}"`));
  }
  const library = search.match(/<nav\b[^>]*aria-label="Library"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  assert.ok(library.includes('href="/?tab=following"') && library.includes('href="/playbook"'));
  for (const id of ["explore-destinations", "desktop-explore-destinations"]) assert.ok(search.includes(`popoverTarget="${id}"`));
  assert.ok(search.includes('aria-label="My profile"'));
  assert.ok(search.includes('aria-label="Explore the community"'));
  await journey("/?tab=following", {redirectTo:"/signin?next=%2F%3Ftab%3Dfollowing"});
  const followed = await journey("/?tab=following", {session:true, html:true});
  const followedPrimary = followed.match(/<nav\b[^>]*aria-label="Primary desktop"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  const followedLibrary = followed.match(/<nav\b[^>]*aria-label="Library"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  assert.doesNotMatch(followedPrimary, /aria-label="Home" aria-current=/);
  assert.match(followedLibrary, /aria-label="Following" aria-current="page"/);
  await journey("/search?scope=players", {includes:['aria-label="League region"', 'name="q"', "Player stats"]});
  const cached = await journey("/search?scope=players&q=Fixture%20Support", {html:true});
  assert.ok(cached.includes("Fixture Support#WAVE") && !cached.includes(">Community profiles</h2>"));
  await journey("/search?scope=players&q=Fixture%20Support%23WAVE&region=na1", {redirectTo:"/player?platform=na1&riotId=Fixture+Support%23WAVE"});
  await journey("/search?q=Fixture&scope=people", {includes:["Community profiles"], excludes:[">Riot players</h2>"]});
  await journey("/rooms/general", {includes:['property="og:type" content="website"',"Share room"]});
  await journey("/u/501", {includes:['property="og:type" content="profile"', "Share profile"]});
  await journey("/search?q=NothingMatchesThisName", {includes:["No matches for","browse rooms","Look up a Riot ID"]});
  await journey("/activity?tab=muted&before=77",{status:307,signInReturn:"/activity?tab=muted&before=77"});
  const muted = await journey("/activity?tab=muted&before=77", {session:true, html:true});
  assert.ok(muted.includes("Back to latest threads") && muted.includes("You’ve reached the end."));
}
