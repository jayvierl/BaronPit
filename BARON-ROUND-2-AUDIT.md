# Baron Pit release audit · November 26, 2026

## Production and source

The public alias served Muse’s deployment `dpl_CLgYJcG1PFPzFSUBRivUYErZZ5Rh`. Its source and the two original Runway PNGs were recovered from Vercel and matched to the deployment’s file hashes. The local checkout contained the newer social, duo, sign-in and safety work from `dpl_HTZi1ebmEsXnM3WnvR7jKNhJNSMC`. Both were file-based releases to the same Vercel project. Engineers should treat the integrated source as the release baseline. The previous [Muse engineering handoff](CODEX-DEEP-AUDIT.md) describes an earlier implementation.

The alias returned real 404s for `/questions`, `/lfg/thanks`, `/review-hour`, `/safety`, `/pilot/phone-test`, `/items/3190`, and `/builds/compare`. A successful homepage response missed all seven regressions. The integrated release restores these routes alongside the Baron room, artwork and community features.

## Six requested reviews

| Review | Evidence and change |
| --- | --- |
| Flair | The deployed queries repeated the rank and main formatter. One post reader and `rank.ts` now produce consistent feed and profile labels. A rank without a champion displays the rank. A missing rank displays Unranked for verified links. A public player lookup still shows Riot stats, while a claim alone grants no social rank flair. Tests cover missing, empty and malformed pools. |
| Clock | Muse cleaned up its interval correctly. Its “up” condition selected the first six seconds of the epoch-aligned cycle. The opt-in lobby rally now opens for the final six seconds, resamples wall time on resume, and stops updating in hidden tabs and on unmount. It describes a community gathering. |
| Daily objective | Five full counts ran on every home request, including private duo activity and held contributions. One parameterized statement computes the active UTC goal with bounded unique contributors and indexed date ranges. It excludes automated posts and respects visibility. An actionable match question replaces a closed or unavailable activity. Pilot targets are three contributors for writing/reviewing and five for reactions. |
| Spotlight | One database row holds the day’s pick across workers; the lookup rechecks verified ownership, account visibility, and viewer blocks/mutes. Profile headers request a boolean in their existing query. The homepage loads the selected card after the main feed can render. With no eligible player, the badge stays absent. |
| Baron stats and compatibility | Riot’s team objective data identify the team and count. The data cannot establish which player made the call. New snapshots preserve exact team counts, older positive flags receive team credit, and missing fields remain unknown. One game counts once toward the badge. Shared cards derive the facts from the server’s snapshot; refreshes reuse already-fetched match IDs and do not trigger a broad backfill. |
| Polls | The server constructs the allowed payload for each post type. Only the canonical four-choice Baron poll displays the call banner. A legacy customized ballot keeps its option order and vote indices. The compose flow restores custom choices when switching modes and preserves drafts across sign-in. Voting and build reconfirmation use a single database statement per action. |

## Additional fixes

- Integrated sign-in uses the configured canonical origin and requires a confirmation action to redeem an email link. A mail preview can open the link safely. Existing users missing a recorded acceptance must accept the current terms before publishing. A review-hour host returns to the event after sign-in.
- Moderation counts independent reporters. The integrated app suppresses held identities in shared feed, search and thread readers and removes the associated public verified-owner link. Public uploads are paused pending private screening. A human review of an attached post cannot secure an already-public file.
- The reserved patch publisher is renamed during migration; existing room memberships, posts, IDs and moderator redactions survive. The original room artwork is served responsively at roughly 11–32 KB. The original PNG URLs remain available. Dark-theme button text contrast improved from 2.72:1 to 6.50:1.
- Match discussions, one-fix replies, build comparison, verified duo preferences, and the appreciation preview are included. Real-money checkout and verified stranger matching depend on their documented approvals and operational configuration.

## Reproducing the release checks

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm run smoke`. The production HTTP smoke runner uses isolated fixture identities and PostgreSQL data. Run `npm run check:release -- https://ward-party.vercel.app` after deployment to detect the split-release regression at the public alias.

The release review also exercised migration twice against the 31 schema statements recovered from Muse. Existing social records survived, and legacy records did not gain a verified or approved status during migration. Public production tests do not exercise personal inbox delivery, approved Riot Sign-On, or real payments. Performance improvements above describe query shape and asset bytes; field latency, retention, and duo-match success require production measurements.
