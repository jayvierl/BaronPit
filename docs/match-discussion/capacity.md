# Match discussion capacity and operations

Reviewed November 27, 2026 for Baron Pit, Vercel project `ward-party`. Runtime measurements below come from synthetic data. Provider checks used read-only project metadata. No production SQL, player refresh, provider subscription change, or new telemetry was used.

## Configuration verified

| Surface | Evidence | Remaining operator check |
| --- | --- | --- |
| Production hosting | Vercel listed the existing production deployment as ready in `iad1`; the project specified Node 26.x. Vercel's team response did not expose an effective billing plan or a remaining resource allowance. | Use the Vercel dashboard for this project's time window, plan, included units, overages and spend alerts. An allowance shared among projects cannot be assigned wholly to Baron Pit. |
| Function traffic and transfer | Scoped project queries for November 26 UTC for `vercel.request.count` and `vercel.request.fdt_out_bytes` returned HTTP 402 and required Observability Plus. The billing-charges endpoint for the same UTC day returned HTTP 404 `costs_not_found`. No CLI login was available. | Use an existing billing/usage export if available. Current request volume, cold starts, billed function time, transfer, and production percentiles remain unknown. |
| Database | Production lists `DATABASE_URL`, an unpooled URL and the Neon integration variables. The team Marketplace configuration reports Neon Free and an empty selected-project list. Those responses do not associate that plan with this specific database. The application connects using Neon's HTTP SQL client. Preview reads require `WARD_PREVIEW_DATABASE_URL`, absent in the project environment inventory. | Confirm this database's plan, compute hours, autoscaling bounds, storage, transfer and scale-to-zero behavior in its Neon console. The production daily job and existing routes share those resources. Give a database-backed preview its own approved connection before using it for acceptance. |
| Storage | Blob store metadata and its server token are present for production. The match discussion projected into a post is text and JSON in Postgres. This flow uploads zero media files. | Existing Blob bytes, bandwidth and billing tier remain unverified. Discussion payload estimates below exclude other features' media. |
| Riot | A production-scope `RIOT_API_KEY` entry exists. The contextual preview rereads one existing snapshot, with a 24-hour source freshness check and at most 100 match positions accepted. The discussion feed reads archived context. Catalog lookups have a distinct cache and can call public Data Dragon when cold. | Confirm the key class, awarded per-method/application limits and API approval in the Riot portal. Key presence does not establish these values. Watch upstream 429s and honor Retry-After. New discussion views and match confirmations do not require a live match-history refresh. |
| Email, pilot and safety ownership | Production metadata lists `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `CRON_SECRET` and `ADMIN_EMAILS`. `/admin/pilot` requires an authenticated, unbanned admin. The inventory lacked `SAFETY_OWNER_EMAILS`, `PILOT_HOST_EMAILS` and `PILOT_FIXTURE_EMAILS`. Safety owners must be in both the admin and safety-owner sets. On-call worker credentials belong to the external worker. | An authorized admin should sign in and open the pilot dashboard. Name the two responders and rehearse an acknowledgement on the external worker before public recruitment. Confirm the facilitator/QA exclusions used in pilot metrics. Actual inbox delivery, named-person access and on-call coverage were not exercised. |

[Hosting and usage](https://vercel.com/docs/pricing) · [Neon plans](https://neon.com/docs/introduction/plans) · [Riot rate limits](https://developer.riotgames.com/docs/portal) · [Database environment isolation](../../src/lib/db.ts) · [Pilot operation](../../PILOT.md) · [Safety-owner lookup](../../src/lib/safety-cases.ts)

## Reproduce the fixture

From the repository root with its lockfile dependencies installed, run the fixture with the following command.

```sh
npx vitest run --config scripts/capacity/vitest.config.ts
```

The dedicated configuration excludes this scenario from routine unit tests. The runner uses the real schema, feed readers, visibility predicates, match preview, publication and admin aggregate. It substitutes PGlite for the Neon transport, provides an in-memory champion/item catalog and rejects outbound fetches. It cannot connect to production. Tests exercise a signed-in viewer with 20 followed accounts, two joined rooms, one block and one mute. The fixture seeds 1,000 accounts, 1,000 cached player records with 20 match observations each, 10,000 posts over roughly two weeks, 500 contextual questions, three replies per post including one nested reply, 5,000 reactions and 100 reposts. It has zero pilot enrollments. Data distribution matters when comparing timings with real traffic.

## Measured results

Each reader ran once to warm it, then ten times sequentially. The table shows the last full run, on shared x86-64 Linux, Node 24.22.3 and PGlite 0.6.0. P50 is the fifth of ten ordered observations, P95 the tenth. Numbers are rounded to milliseconds. JSON bytes count the serialized application object before compression. Rows describe returned records, including nested replies. The database call count includes the app’s enrichment queries and excludes schema initialization. The complete HTML, React payload, images, authentication and other widgets are outside these measurements.

| Operation | SQL statements | Returned rows | JSON bytes | P50 ms | P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| For You, page 1 | 4 | 30 | 20,286 | 161 | 449 |
| For You, page 2 | 4 | 30 | 20,276 | 216 | 484 |
| Following, page 1 | 4 | 30 | 19,813 | 51 | 97 |
| Following, page 2 | 4 | 30 | 20,011 | 73 | 210 |
| Match attachment preview | 1 | 1 | 431 | 2 | 35 |
| Discussion replies | 2 | 3 | 1,060 | 5 | 30 |
| Tonight summary, explicitly opened | 1 | 1 | 135 | 900 | 1,006 |
| Internal pilot metrics | 1 | 1 | 158 | 63 | 125 |
| Replay of the same publish request | 1 | 1 | 45 | <1 | 1 |

Across two consecutive 30-post pages there were zero repeated post IDs on either tab. Held posts and both suppressed authors stayed out. A first contextual publish took eight SQL statements and 17 ms in this run. Ten retries left one stored post. A separate group of four overlapping requests using the same draft ID returned the same post and also stored one row. Eight simultaneous feed callers across eight synthetic viewers and both tabs issued 28 statements and completed in 1,761 ms combined. PGlite serializes database execution in one process. This exercise covers overlapping application work and retry behavior. It cannot certify independent Neon connections, concurrent writer isolation under real network failures, or any live concurrent-user ceiling.

The fixture's application tables and their indexes occupied 17,604,608 bytes (16.79 MiB) after the scenario. Repetitive synthetic text and snapshots compress well. This number excludes WAL, backups, branches, media, external matches beyond these snapshots, and provider overhead. There were zero outbound fetches during the run. A real cold process may need Data Dragon for the existing champion/item catalog. Mail sign-in and a requested fresh Riot lookup are separate operations.

### Performance changes made during the audit

- The original For You page-1 reader measured 2,467 ms P50 and 2,821 ms P95. A semijoin in the visible-reply ancestry query removed repeated comparisons against candidate posts. On the same input, a single local query plan dropped from 4,100 ms to 118 ms. The output count and byte size stayed the same. Another complete optimized run measured 105/126 ms for page 1; shared-runner variance is substantial. [Viewer-filtered reply SQL](../../src/lib/community-queries.ts) · [Feed reader](../../src/lib/post-reader.ts)
- The original Tonight reader measured 5,052/11,144 ms. Its plan discarded 19,952,854 candidate pairs while reconciling match timestamps. A window over each match now performs the same cross-player consistency check once per group. The first optimized run measured 273/1,003 ms. Opening an ordinary feed now executes **zero Tonight queries**. The native `Tonight in the pit` link inside `Around the community` explicitly requests this summary on the same home page and disables link prefetch. The server still applies the current viewer’s blocks, mutes, account restrictions and public queue checks for each request. [Home entry point](../../src/app/page.tsx) · [Summary and visibility query](../../src/lib/tonight-in-the-pit.ts) · [Timestamp and visibility regressions](../../src/lib/tonight-in-the-pit.test.ts)
- To inspect the Tonight query plan on the current implementation, prefix the reproduction command with `CAPACITY_PLAN=tonight`. It executes `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` against the disposable local fixture.

### Translate workload into a pilot budget

As an illustration, assume three feed-page reads per daily active user, a 30-day month and the first-page For You mix above. At 1,000 daily active users this generates 3,000 feed reads and about 12,000 corresponding SQL statements per day. The serialized feed objects add up to about 1.83 GB per month. At 10,000 daily active users those figures become 30,000 reads, 120,000 SQL statements per day and about 18.26 GB per month. These figures measure logical objects; actual transfer bills use the provider's payload, caching and compression measurements. Thread visits, other home sections, backgrounds, asset downloads and writes need separate budgets.

Before expanding traffic, capture the existing hosting and database usage during a representative pilot week and compare the busiest interval with available compute and transfer. Watch the For You read under peak reply activity, Tonight on explicit opens, and the internal 28-day report as the data set grows. Confirm current plan details and quota alerts with the account owner. Estimate dollars from the actual contract and metering export. The synthetic fixture establishes neither a monthly invoice nor spare production capacity.
