# Local match discussion demo

The automated demo uses two separate Chromium browser contexts and a fresh local PostgreSQL fixture. It starts with a guest looking up `Synthetic Depth#LAB`, then uses two pre-seeded community sessions. Demo River and Demo Lane have independent browser storage and neither has linked a Riot ID. The fixture supplies the Riot snapshot and account sessions. The website's real navigation, forms, route handlers, moderation, reads, and database writes run as usual.

## Run the demo

```sh
npm ci
npm run build
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/smoke/match-discussion-demo.mjs
```

The script binds to an available loopback port and removes its temporary server when it finishes. It saves the screenshots and `verification.json` next to this guide. Use `SMOKE_SCREENSHOTS` to choose another directory. A supplied Playwright installation can be selected with `SMOKE_PLAYWRIGHT_MODULE`, and `SMOKE_CHROMIUM` can point to an installed Chromium binary.

## Open the guest demo

After `npm run build`, run `node scripts/smoke/match-discussion-demo.mjs --serve` and open the printed link. It goes directly to the synthetic match, where you can open **Discuss this match** and inspect the public preview as a guest. The fixture only listens on your computer. Press Ctrl+C to stop it.

## Walkthrough

1. Search for `Synthetic Depth#LAB` on NA. Use the keyboard to open **Discuss this match** on the latest game. Draft a question and keep the return link through sign-in.
2. Use Following's room interests link to join Nami Mains as Demo River. Return to the draft, review the public match preview, and confirm publication. A submission without confirmation is rejected by the server.
3. Open the published post in Demo Lane's separate session, first from the public feed and then from the matchup hub. Like, save and follow the author. Verify the post in Following and Saved, then leave a reply.
4. Open the exact reply from Demo River's Activity. Follow the match link and verify that the original scoreboard, item names, rank, and match timestamp survive a reload.
5. Exercise mute, unmute, block, and post withdrawal. Verify that the public website and each account see only the content they can access.

## Browser evidence

Eight Chromium checks passed across 390 px mobile and 1,440 px desktop viewports. [Verification results](verification.json)

- [Open a discussion from a match on mobile](01-match-mobile.png)
- [Review the public preview and match source](02-public-preview-mobile.png)
- [Confirm the public match attachment](02b-attachment-consent-mobile.png)
- [Read the published thread and return to the match](03-published-thread-mobile.png)
- [Find the thread in the desktop matchup hub](04-matchup-hub-desktop.png)
- [Open an exact reply from mobile Activity](05-reply-activity-mobile.png)

The demo uses only simulated account sessions and loopback requests. The fixture starts without real Riot or email-provider credentials.

The standalone [signup integration](../../src/lib/auth-match-onboarding.test.ts) exercises the welcome email, age and terms consent, and one-time link verification through the real route handlers and a local PostgreSQL fixture. A delivery stub captures the message for one reserved synthetic address in memory. The new unlinked account’s public-match question goes to moderator review.
