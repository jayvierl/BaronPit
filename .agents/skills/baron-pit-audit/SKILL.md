---
name: baron-pit-audit
description: Audit the Baron Pit social and duo platform, compare its player experience with Threads and X, and prioritize release defects, partner matching, and pilot outcomes. Use for a platform audit, readiness review, competitor comparison, or post-release verification.
---

# Baron Pit product and engineering audit

Run from the Ward Party project root. Scope the work to the request. A request for an assessment produces findings and priorities. A request for fixes includes the changed behavior and its verification.

## Establish which release you are reviewing

Read `AGENTS.md`, `README.md`, the most recent engineering handoff, `PILOT.md`, and the relevant duo and safety notes. Get the deployment ID behind the public alias and any Git revision Vercel actually records. Compare with the checkout, source hashes or release artifact. Surface discrepancies before attributing a checkout finding to production. Identify the date, environment and user state used for each observation.

## Trace what a player can do

1. Follow the guest journey from a shared discussion through reading an answer, drafting a reply, sign-in, returning to the same thread and finding that reply again. Distinguish email delivery and cross-browser draft recovery from local route coverage. Record the first point of friction.
2. Inspect an empty Following feed and an active one. Follow a room tag and a player profile. Check how replies, saved posts, watched discussions and unread activity help someone return. Compare sharing a URL with an attributed in-feed repost.
3. Trace duo preferences through eligibility, a visible listing, a request, acceptance, a shared match and a mutual second game. Use the region, age band, consent, verification and visibility rules actually present. Test reciprocal role fit and whether play windows overlap across time zones and daylight-saving transitions. Check how each person learns that an invitation is waiting.
4. Review data and safety boundaries in code and fixtures. Look at old and new Riot snapshots, account-ownership claims, blocks, mutes, held content, private invitations, appeals, and the effect of room seeding after a moderation action. Use synthetic accounts and disposable data for state changes. Distinguish a saved duo plan, a verified match, a thank-you, and a payable tip in the report.
5. Read `PILOT.md` and inspect what each measurement actually counts. Separate participant activity from host contributions. For a duo cohort, show eligible pairs at each step, how many played together, and how many mutually chose to play again. Publish the denominator and the observation window. Mark missing measurements as unknown.

## Run verification

Read `package.json` for changed commands and use the project's installed dependencies. Run these checks in the current checkout.

```sh
npm test
npm run lint
npx --no-install tsc --noEmit --incremental false
npm run build
npm run smoke
npm run check:release -- https://baronpit.com
```

The smoke runner uses the optimized build and isolated fixtures. The last command checks public content on the live alias. On Node 24 in a workspace using an HTTPS proxy, prefix the last command with `NODE_USE_ENV_PROXY=1`. Check the actual page content and the returned state. An eligibility notice, a public directory, and a working end-to-end match are three different observations.

## Compare and prioritize

Use first-party Meta and X documentation for any platform behavior being compared. Inspect the home feed, following controls, public replies, reposts or quote posts, topic discovery, and activity after posting. Give concrete examples of what a player can do on each product. Any 1–10 similarity score is an editorial assessment of those interactions. Score public launch readiness and social demand separately if requested. Pilot retention, reply time and repeat duo games require observed participant data.

Return the verified release and test results, followed by the three most valuable improvements in priority order. For each, explain who is affected, cite a route or source file, and define a success check. Mark features as live, gated, fixture-tested or proposed. Name decisions requiring the owner or a provider. Distinguish fixes actually shipped from recommendations.
