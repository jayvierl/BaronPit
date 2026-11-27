# Integrated community demo

This local walkthrough connects game search, champion hubs, item pages, build threads, quotes and profile match discussions. It uses Chromium with a fresh PostgreSQL fixture and real application routes. One synthetic account has a linked fixture Riot ID. Another is unlinked. A third browser context stays signed out.

## Run it locally

```sh
npm ci
npm run build
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/smoke/community-workflows-demo.mjs
```

The script binds to a loopback port and stops the server when it finishes. Set `SMOKE_SCREENSHOTS` to choose a different evidence directory. You can supply an installed Playwright module with `SMOKE_PLAYWRIGHT_MODULE` and a Chromium executable with `SMOKE_CHROMIUM`. Screenshots use 390 × 844 and 1,440 × 960 viewports. The browser limits requests to the local fixture, so Riot CDN item and spell art can appear as placeholders.

## Browser journeys

1. Search for Nami as a guest on mobile. Walk through the champion hub’s Overview, Discussions and Builds tabs.
2. Find Infinity Edge via Game data search. Open **Share a build with Infinity Edge** to carry the item into the composer. Select Nami, add Boots and Press the Attack, mark the build off-meta, and publish its permalink. Find the build by champion in search and the hub.
3. Save, reply, repost and quote as the separate unlinked account. The same quote submission identifier returns the original permalink on retry. Close and reopen new replies as the author and verify that the existing reply stays visible in both states.
4. Open the verified fixture player’s match history. Request the Riot objective timeline, then return to the selected game. Publish a match discussion with consent. Visit the exact match from the thread and find the thread again from the profile’s Match discussions tab. Mark the other account’s reply helpful and log the outcome from My progress.
5. Block the second account and verify the build disappears from its direct link, search and private saved list. After the author withdraws the build, a guest sees the quote’s own text with an unavailable-source placeholder.

## Evidence

All eight Chromium checks passed. The optimized build also passed 237 normal production HTTP smoke journeys against the fixture. [Browser verification results](evidence/verification.json)

- [Champion hub on mobile](evidence/01-champion-hub-mobile.png)
- [Prefilled item and build choices](evidence/02-build-composer-mobile.png), [published build and item return link](evidence/03-build-permalink-mobile.png), [desktop build search](evidence/03b-build-search-desktop.png)
- [Native quote](evidence/04-native-quote-mobile.png), [closed reply state with the existing reply](evidence/04b-closed-replies-desktop.png), [quote after source withdrawal](evidence/07-quote-after-withdrawal-mobile.png)
- [Match objective timeline](evidence/05a-objective-timeline-mobile.png), [profile match discussions](evidence/05-profile-discussions-mobile.png), [saved progress outcome](evidence/06-follow-up-mobile.png)
