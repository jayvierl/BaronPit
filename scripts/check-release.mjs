// Read-only check for the two feature sets that previously shipped from divergent checkouts.
import assert from "node:assert/strict";

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
];
let failures = 0;
for (const [path, markers] of routes) {
  try {
    const response = await fetch(new URL(path, origin), { redirect: "error", signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, "HTTP " + response.status);
    const html = await response.text();
    assert.ok(!html.includes("NEXT_HTTP_ERROR_FALLBACK;404"), "Streamed missing page");
    for (const marker of markers) assert.ok(html.includes(marker), "Missing " + marker);
    console.log("PASS", path);
  } catch (error) {
    failures++;
    console.error("FAIL", path, error.message);
  }
}
if (failures) process.exitCode = 1;
