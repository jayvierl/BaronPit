// Signed-out release checks against rendered pages; these only issue GET requests.
import assert from "node:assert/strict";
import { documentMarkup } from "./check-pathways.mjs";

const origin = new URL(process.argv[2] || "https://baronpit.com").origin;
const pitBanner = new Date().getUTCMonth() === 11 ? "baron-pit-winter-960.webp" : "baron-room-960.webp";
const routes = [
  ["/", ["Feed selection", "Post to the Pit", 'aria-label="Discover"', "Find your duo", "Match questions", "Lobby rally clock", "community objective"]],
  ["/rooms/general", ["The Baron Pit", pitBanner]],
  ["/questions", ["Matchup notebook"]],
  ["/lfg", ["Find a duo", "Thanking a teammate after a game"]],
  ["/lfg/thanks", ["Thank your duo"]],
  ["/review-hour", ["Bot lane review hour"]],
  ["/safety", ["Safety Center"]],
  ["/pilot/phone-test", ["Try a matchup thread on your phone"]],
  ["/builds/compare", ["Compare build paths"]],
  ["/search?scope=league&q=Nami", ['id="found-champions"', ">Nami<"]],
  ["/items/3031", ["Infinity Edge", "See builds with this item"]],
  ["/rooms/champ-nami?feed=builds", ["Nami", "Share a build"]],
  ["/signin?enrol=1&next=%2Fplaybook", ['type="email"'], "/signin?next=%2Fplaybook"],
];
let failures = 0;
for (const [path, markers, expectedRedirect] of routes) {
  try {
    const options = { redirect: "manual", signal: AbortSignal.timeout(30000) };
    let response = await fetch(new URL(path, origin), options);
    if (expectedRedirect) {
      assert.equal(response.status, 307, "Missing sign-in redirect");
      const location = response.headers.get("location");
      assert.ok(location, "Missing redirect location");
      const destination = new URL(location, origin);
      assert.equal(destination.href, new URL(expectedRedirect, origin).href, "Incorrect sign-in return path");
      response = await fetch(destination, options);
    }
    assert.equal(response.status, 200, "HTTP " + response.status);
    const html = await response.text();
    assert.ok(!html.includes("NEXT_HTTP_ERROR_FALLBACK;404"), "Streamed missing page");
    const rendered = documentMarkup(html);
    for (const marker of markers) assert.ok(rendered.includes(marker), "Missing " + marker);
    console.log("PASS", path);
  } catch (error) {
    failures++;
    console.error("FAIL", path, error.message);
  }
}
if (failures) process.exitCode = 1;
