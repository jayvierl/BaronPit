# League community app

This is the source for the Vercel project `ward-party`. The brand comes from `NEXT_PUBLIC_APP_NAME`. The app centers on community discussion and finding a compatible duo. Short, recent-form lookups give players material to discuss.

- [Muse’s original audit](AUDIT.md) records the initial problems. Some findings were already repaired when this source was recovered.
- [Baron Pit round-two audit](BARON-ROUND-2-AUDIT.md) covers the production-source reconciliation and the six Baron feature checks. [Muse’s round-one handoff](CODEX-DEEP-AUDIT.md) is preserved for comparison.
- [Engineering handoff](ENGINEERING-HANDOFF.md) records the newer findings, changes, measurements and release checks.
- [Community safety operations](COMMUNITY-SAFETY.md) covers staffing, evidence, appeals, emergency controls and urgent paging.
- [Duo and media operations](DUO-AND-MEDIA.md) covers verified first contact, existing public objects and upload prerequisites.

- [Duo appreciation and tipping](DUO-TIPPING.md) covers the proposed money flow and the external decisions it requires.
- [Community pilot](PILOT.md) covers recruitment, useful replies, retention, costs, and the investment decision. The public pilot opens at `/pilot` and the private results at `/admin/pilot`.

## Run

Use Node 22 or newer. Run `npm ci` and `npm run dev`. Use `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` and then `npm run smoke` to verify a release. The smoke command runs the built application on loopback with synthetic PostgreSQL data. It uses no real account, database, Riot key or email recipient.

Run `npm run check:release -- https://ward-party.vercel.app` after promotion. This checks public page content for both the social/duo release and the Baron release. Compare the live deployment ID with the one reviewed before promotion.

## Configuration

Set secrets in the appropriate Vercel environment or in a local, ignored env file. The example file contains variable names only. Production uses `DATABASE_URL`. A Vercel preview can use a dedicated `WARD_PREVIEW_DATABASE_URL`. Without that setting the preview serves the public catalog and read-only pages and labels community data unavailable. This prevents a review deployment from migrating a database shared with production.

Resend needs a verified sender and canonical origin. The app will accept the Vercel system origin or an explicit `APP_ORIGIN`. Riot lookup uses a server-side key. A public player lookup or a claim cannot establish ownership. Leave verified duo matching off until the RSO client is approved, configured and tested. Native media intake stays paused. Moderators can review canonical links to supported video providers for outbound sharing.

## Persistence and deployment

The database stores one replaceable player snapshot with up to 20 recent matches. Refresh freshness is ten minutes. A user-published match card keeps the selected summary. No per-match history is collected. Persistent social records and protected moderation records use separate tables. A revision check skips setup on an up-to-date database. An upgrade uses an ordered, advisory-locked transaction. Keep older account and social data when rolling forward.

Deploy this directory to the existing `ward-party` project. Check the live alias immediately before promotion for intervening releases. Run the smoke suite on the exact source bundle, check the preview and review the safety release gates with the owner before changing the live alias.
