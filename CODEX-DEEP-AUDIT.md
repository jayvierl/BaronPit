# Ward Party — Deep Audit & Engineering Handoff for Codex

**Date:** 2026-11-26 · **Status:** LIVE at https://ward-party.vercel.app · **Codebase:** `~/workspace/ward-party` (this repo)
**Purpose of this document:** a complete, honest account of what was built, what was audited, what was already fixed, and — the main event — the prioritized performance and quality work that remains. Written so a reviewing engineer (Codex) can start improving the app without re-deriving any of it.

A companion file, `AUDIT.md` in this repo root, is the raw audit report (2026-11-26) with file:line evidence for every finding referenced here as A/B/C/D items.

---

## 1. What this product is

Ward Party is a **social platform first, stats second** for League of Legends players — Threads-style in structure and presentation (monochrome, single centered column, icon rail / bottom nav, thread-line comments), with League content and a restrained Hextech gold/deep-blue accent.

- **Social core:** passwordless accounts, profiles, follows, a feed (Everyone / Following), posts (text, build, poll, clip-link, game card, uploaded photo/video), threaded comments, positive-only reactions, endorsements, rooms (5 broad + one per champion, ~173), an LFG duo board, search.
- **Stats as the trust layer:** fast recent-form lookups only (last ~20 games per player), surfaced on player pages and profiles. **There is deliberately no archive.**
- **Moderation is a day-one system**, not an afterthought (see §4.4).

### Hard constraints — do not break these

1. **Minimal retention by design.** `wp_players` holds only the latest recent-form snapshot per player (last ~20 matches), overwritten on refresh. Never add match history/archival tables.
2. **Riot policy walls.** No hidden-MMR estimation (LP features may use only the player's own visible numbers), no champ-select scouting of hidden players, no de-anonymizing Streamer Mode players, no smurf/bot labels on named players, no shaming/dodge tags, no real-time in-game overlays/coaching/cooldown trackers, no gambling mechanics. Advice features give reasons and alternatives, never verdicts. Tilt features are self-facing only.
3. **Riot integration is gated.** Production app ID 911877 is **Pending Review**. Until approval: the API key is a 24-hour dev key (rotated by an external chain — do not hardcode keys anywhere), verified Riot linking (RSO) is unavailable (linking is claim-based; `wp_links.verified` stays false), and monetization is disabled (no checkout code paths may be activated).
4. **Verified-by-API rule.** Ranks, form, and stats shown anywhere must come from the Riot API snapshot, never user input. Game cards are re-derived server-side from the snapshot at post time (see fix A5) — keep it that way.
5. **Moderation rules are product law.** Positive-only reactions (🔥 ❤️ 👏 🎯 GG — no downvotes/dislike). Media posts from low-trust accounts are always held for human review. Off-platform contact handles are blocked in LFG. The Junior-A-style exception handling and sanctions ladder live in the moderation spec; the code in `src/lib/moderation.ts` and the admin queue implement it — do not weaken thresholds casually.
6. **Brand is config.** The product name is a working title driven by `src/lib/brand.ts` + `NEXT_PUBLIC_APP_NAME`. Never hardcode "Ward Party" in new code.

---

## 2. Stack & infrastructure

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.4.6 (App Router), React 19, TypeScript (strict) | `params` is a Promise; `await cookies()` — Next 16 conventions throughout |
| Database | Neon Postgres via `@neondatabase/serverless` | Fresh DB for this app (Vercel integration resource `neon-cerise-island`). Lazy schema in `src/lib/db.ts` — no migration framework |
| Media | Vercel Blob, store `ward-party-media` (public, iad1) | Direct client uploads via `@vercel/blob/client`; server validates host + type/size |
| Email | Resend | Magic-link auth; domain riftfix.com verified; sender `Ward Party <noreply@riftfix.com>` |
| Hosting | Vercel, project `ward-party` (account jayvierl-9946) | Production = `ward-party.vercel.app` |
| Cron | Vercel Cron → `GET /api/cron/patch-watch`, daily 13:17 UTC | Authenticated with `CRON_SECRET` bearer (Vercel sends it automatically) |
| Tests | Vitest | 16 tests, all in `src/lib` (pure logic only — no component/route tests yet) |
| Lint | ESLint 9 flat config (`eslint.config.mjs`) | Restored during the repair pass; currently **0 errors, 29 warnings** (mostly `@next/next/no-img-element`) |

**Env vars (Production, names only):** `DATABASE_URL` (+ Neon integration siblings), `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `RESEND_API_KEY`, `RIOT_API_KEY` (24h dev key — rotated externally), `ADMIN_EMAILS`, `AUTH_EMAIL_FROM`, `NEXT_PUBLIC_APP_NAME`, `CRON_SECRET`.

**Deploy flow:** `npm run build` → `/usr/bin/vercel deploy --prod --skip-domain` → `/usr/bin/vercel promote <url>`. Note: bare `vercel` in this shell is a connector shim; the real CLI is `/usr/bin/vercel` and is wiped on VM restarts (reinstall: `npm install -g vercel@66.6.0`).

**Scale snapshot:** ~4,850 lines total source. Largest files: `src/lib/social.ts` (706), `src/components/social-ui.tsx` (590), `src/app/globals.css` (353), `src/lib/riot.ts` (235), `src/lib/db.ts` (222), `src/lib/pure.ts` (200).

---

## 3. Architecture & file map

```
src/
  app/
    page.tsx                 Home: spotlight, composer, feed tabs, rooms list, trending
    layout.tsx               Top bar, icon rail / bottom nav, fonts (Space Grotesk + Inter)
    globals.css              Entire design system (plain CSS, CSS vars, dark via prefers-color-scheme)
    player/page.tsx          Player profile (recent form, last 3 games, reads, showcase, badges)
    u/[id]/page.tsx          User profile (Threads-style, flair + earned badges, tabs)
    post/[id]/page.tsx       Single post + comments (one-fix supported)
    rooms/page.tsx           Broad rooms + searchable champion-room grid
    rooms/[slug]/page.tsx    Room page: banner, room pulse, composer, room feed
    lfg/page.tsx             Duo board (schedule-block filter)
    champions/page.tsx       Champion grid (every champion links to its room — all exist now)
    builds/page.tsx          Builds explorer
    search/page.tsx          Players / users / rooms / hashtags
    me/page.tsx              Own profile edit, link/unlink, my reports, reform notices
    signin/page.tsx          Magic-link request
    admin/moderation/page.tsx  Admin queue (approve/remove/dismiss/suspend), ADMIN_EMAILS-gated
    guidelines|terms|privacy/  Published policy pages
    api/
      auth/                  request-link, verify, signout
      account/               link, unlink, profile
      social/                post, comments, react, vote, endorse, follow, block, mute,
                             report, room-join, upload (Blob token), builds/reconfirm
      lfg/                   create/close listings
      admin/resolve/         moderation actions
      cron/patch-watch/      daily patch detection → room briefings (CRON_SECRET-gated)
  lib/
    db.ts        Neon access + lazy schema (all wp_ tables, indexes)
    auth.ts      Magic links (sha256-hashed, 15-min, single-use), 30-day sessions, ban check
    auth-email.ts  Resend sender
    riot.ts      Riot API client, 10-min snapshot cache, Data Dragon (patch/champions, cached)
    social.ts    The social engine: rooms, posts, comments, reactions, follows, LFG,
                 endorsements, spotlight/highlight, patch watch, build re-confirm
    pure.ts      Client-safe pure logic: summarize, formReads, earnedBadges, samePatch,
                 SCHEDULE_BLOCKS, fnvHash/rotationIndex, REACTION_EMOJIS, ENDORSE_KINDS, splashUrl
    moderation.ts  Three-band content scoring (block / hold / publish), contact-handle detection
    platforms.ts   Platform id list + guard (client-safe)
    brand.ts       App name/description config
  components/
    social-ui.tsx  Composer (5 kinds incl. media upload), PostCard, CommentSection, buttons
    lfg-ui.tsx     LFG form + board (schedule filter)
    rooms-ui.tsx   Champion-room grid with name filter
    me-ui.tsx      Profile/link management UI
    admin-ui.tsx   Moderation queue UI
    ui.tsx         Avatar, LookupForm, ShareCardButton, rankLabel, small shared bits
```

### Data model (all tables prefixed `wp_`, created lazily by `db.ts`)

`wp_users` (email identity, display name, avatar hue, `banned_until`, `last_seen_at`) · `wp_magic_links` · `wp_sessions` · `wp_players` (puuid PK, rank fields, `snapshot` JSONB = latest recent-form, `fetched_at`) · `wp_links` (user↔player claims, `is_primary`, `verified=false` until RSO) · `wp_follows` · `wp_posts` (kind, body, room_id, `data` JSONB, status visible/held/removed) · `wp_comments` (+ `one_fix`) · `wp_reactions` · `wp_poll_votes` · `wp_rooms` / `wp_room_members` · `wp_reports` · `wp_blocks` / `wp_mutes` · `wp_mod_log` · `wp_endorsements` · `wp_lfg` (+ `blocks` schedule array) · `wp_rate_events` · `wp_meta` (key/value — holds `last_patch` for the patch watch).

---

## 4. What was built (feature inventory)

### 4.1 Phase 1 — the platform (2026-11-25)
Accounts (magic link), profiles with claim-based Riot linking + rank/main flair, feed with 5 post kinds (text/build/poll/clip/game card), comments with one-level replies, positive-only reactions, follows, endorsements (3 kinds, 3/day cap), 5 broad rooms + 16 champion rooms with a live "room pulse" aggregate so no room renders empty, LFG board (rank/form from API only, 4-hour listings, contact handles blocked, Wave = follow), player stats page (recent 20), champions grid, builds explorer, search, daily spotlight + rotating per-profile highlight, auto-join of General + top-3 champion rooms on link.

### 4.2 Presentation (2026-11-25/26)
Full Threads-emulation redesign (presentation only), then a refinement round: Space Grotesk/Inter typography, victory/defeat card tints, room splash banners/thumbnails, and the `/player` page rebuilt as a clean profile (last 3 games with teammates + duo detection, "How they compare" reads from `formReads()`, most-played showcase). Match snapshots were enriched at fetch time with gold/teamGold/teammates — display-only, same snapshot, no new storage.

### 4.3 Media uploads (2026-11-26)
Composer "Media" kind: photos ≤10 MB (jpeg/png/webp/gif), video ≤50 MB (mp4/webm/quicktime), direct-to-Blob upload with server-issued tokens; posts accept **only** our own `*.public.blob.vercel-storage.com` URLs; low-trust accounts' media posts are always held for review. **Known gap:** no automated CSAM hash-matching (PhotoDNA-class) — human review + report/remove is the current backstop. Flag before any scale push.

### 4.4 Trust & moderation (day one, per spec)
Three-band auto-mod (`moderation.ts`): slurs/self-harm bait → block; links/caps/spam/profanity weighted by new-account probation → hold for human review; duplicate-body spam → hold; rate limits; 3+ open reports auto-hold the target; block/mute; admin queue with approve/remove/dismiss/7-day suspend (fail-closed, `ADMIN_EMAILS`); reporter outcome feedback loop; reform-card notices to sanctioned authors.

### 4.5 The five integration features (2026-11-26, from a 40-feature community-complaint deep dive)
1. **Patch-Day Room Briefing** — daily cron checks Data Dragon's latest patch against `wp_meta.last_patch`; on change, a system account posts a briefing (patch notes link + discussion prompts) into every room. Verified live: 21 briefings fired for patch 16.23.
2. **Build Patch Expiry** — build posts compare their patch stamp to the current patch (`samePatch`, major.minor); stale builds show "Outdated — unconfirmed" and authors get a one-tap re-confirm (`/api/social/builds/reconfirm`).
3. **Duo Match by Schedule** — LFG listings carry recurring schedule blocks (`SCHEDULE_BLOCKS` in `pure.ts`, stored in `wp_lfg.blocks`); the board filters to overlapping blocks.
4. **Earned Profile Flair** — `earnedBadges(snapshot)` in `pure.ts`: one-trick (≥60% of games on top champ), win streak, Sharpshooter (KDA ≥5), Playmaker (support, ≥10 assists/game), Hard to kill (≤2.5 deaths/game); max 3, snapshot-scoped, self-history only. Rendered on `/u/[id]` and `/player`.
5. **One-Fix Review Prompt** — game-card posts accept `one_fix` comments (validated server-side: card posts only, parent must belong to the post), rendered with a gold ONE FIX tag. Reasons, never verdicts.

### 4.6 Art (2026-11-26)
Canva launch graphic (navy/gold, "Ward Party — The League community house") — design `DAHb_35UxOU`, PNG in the goal files. A Runway mascot image was specced (original golden ward totem) but **not generated** — the connector approval timed out; treat as open.

---

## 5. The audit (2026-11-26) — findings and their status

Method: full-tree manual read + `tsc --noEmit` (clean) + vitest (16/16) + grep-verified dead-code claims. Baseline surprise: lint had **never run** (ESLint 9 installed, no config existed). Full evidence: `AUDIT.md`.

### 5.1 Confirmed bugs — ALL SIX P0s FIXED in the repair pass (deployed & verified)

| ID | Bug | Fix applied |
|---|---|---|
| A1 | Profile post lists fetched the 60 newest posts **site-wide** and filtered by author in JS — active users saw "No posts yet" | `feedByAuthor()` in `social.ts` — real by-author query; `/u/[id]` uses it |
| A2 | ~154 broken champion-room links (only 16 rooms existed; /champions, trending, player pool all link per-champion rooms) | Rooms seeded for **every** champion from Data Dragon (~173); /rooms gained a client-side name filter (`rooms-ui.tsx`); copy updated to match reality |
| A3 | A failed/partial Riot refresh overwrote a good cached snapshot with empty data (unconditional upsert) | `lookupPlayer` returns the cached player when a refresh yields zero matches and a cache row exists |
| A4 | `/api/cron/patch-watch` callable by anyone | `CRON_SECRET` bearer check; secret set in project env; unauthenticated calls verified 401 |
| A5 | Game-card stats were client-forged (server validated only the matchId, rendered client-supplied K/D/A) | `createPost` overwrites `data.match` + `data.riotId` from the server-side snapshot before insert |
| A6 | Ban check existed on only 5 of ~16 write routes — suspended users could follow/react/vote/endorse/join/edit | `isBanned` check added to all 11 remaining write routes (follow, react, vote, endorse, report, block, mute, room-join, account link/profile/unlink) |

Also fixed in the pass: **A8** YouTube Shorts/live clip URLs rendered a blank embed (path-form parsing added); **A9** comment `parentId` not verified against the post (now checked); **A10** profanity matcher lacked a trailing word boundary ("Dickens" problem — boundary added); **S3** magic-link redemption race (conditional `UPDATE … AND used_at IS NULL` + row-count check); a live production bug the audit surfaced indirectly — the comment composer POSTed to `/api/social/comment` (nonexistent) instead of `/api/social/comments`, so **comments were broken in production**; the dead, unauthenticated `/api/player/lookup` route (with a cache-bypass `force=1`) was **deleted**.

### 5.2 Performance issues found — status

| ID | Issue | Status |
|---|---|---|
| D1 | `ensureRooms()` ran 21 sequential INSERTs on **every** `listRooms`/`getRoom` call (42 per room-page render, up to 84 per account link) | **FIXED** — memoized module-level promise + champion-count short-circuit |
| D2 | `getCurrentUser()` wrote `last_seen_at` on **every** authenticated request | **FIXED** — throttled to one write per user per 5 minutes (folded into the UPDATE's WHERE) |
| D7 | Public `force=1` player refresh bypassed the 10-min cache with no auth/rate limit — anyone could burn the shared dev-key quota | **FIXED** — the TTL now binds forced refreshes too |
| D9 | Schema bootstrap: one transient Neon error poisoned the cached schema promise for the life of the instance | **FIXED** — promise cleared on rejection. (DDL still runs ~30 statements sequentially on cold start — see §6) |
| D10 | Missing indexes: reactions by target, links by puuid, reports by target, mod_log by author | **FIXED** — four `CREATE INDEX IF NOT EXISTS` added to `db.ts` |
| D3 | Home/profile/room pages await independent loads strictly in series | **FIXED 2026-11-26 (second pass)** — `Promise.all` on home, room, profile, and me pages |
| D4 | Trending/room-pulse/spotlight ship up to 200–300 full snapshot JSONBs to JS just to aggregate champion counts | **FIXED 2026-11-26 (second pass)** — trending and room pulse are SQL `jsonb_array_elements` aggregations; spotlight filters `(snapshot->>'games')::int > 0` in SQL |
| D5 | N+1: profile/me pages re-fetch players row-by-row via `getCachedPlayer` after a JOIN already returned them; `primaryPlayer` does the same two-step | **FIXED 2026-11-26 (second pass)** — `playerFromRow` exported from riot.ts; JOIN rows mapped directly; `primaryPlayer` is one JOIN query |
| D6 | `postViews()` runs 4 enrichment queries sequentially; `votePoll`/`reconfirmBuild` pay full post-view cost (5 queries) for a kind/author check | **PARTLY FIXED** — postViews' 4 enrichments and feed's 3 block/mute queries are parallelized; the `votePoll`/`reconfirmBuild` targeted-check refactor remains open → §6.4 |
| D8 | `@vercel/blob/client` imported at the top of `social-ui.tsx`, shipping to every feed viewer | **OPEN → §6.5** |
| D11 | `currentPatch()`/`championList()` caching verified fine (6h/24h module caches) | No action |

### 5.3 Dead code — removed in the repair pass
`PALETTE` + `APP_TAGLINE` (brand.ts — leftovers of the rejected pre-Threads theme), `bestGame()` and `itemIconUrl()` (riot.ts), `wp_players.flex_*` columns and `wp_posts.edited_at` (DDL), `.btn.gold` no-op rule (given real gold styling instead — it's used on CTAs), `--radius`, `.room-grid{display:block}`, `.showcase .overlay .meta` (CSS), the inert `images` block in `next.config.ts`, a `rows={x ? 2 : 2}` ternary, and the `/api/player/lookup` route (above). Shared constants (`REACTION_EMOJIS`, `ENDORSE_KINDS`) moved to client-safe `pure.ts` (the client copies had already drifted); the duplicated FNV-1a hash collapsed into `fnvHash` in `pure.ts`.

### 5.4 Still open from the audit (non-performance)
- **A7 — optimistic UI never rolls back.** **FIXED 2026-11-26 (second pass)** — `PostCard.react`/`vote` snapshot and restore prior state on `!ok`; `FollowButton`/`JoinButton`/`WaveButton` only flip on success.
- **C4 — two flair implementations disagree.** **FIXED 2026-11-26 (second pass)** — all five post SELECTs now compute the full `flairFor` string in SQL (rank + top-champ main, `Unranked` fallback), verified against live data ("Silver I · Ashe main"). Minor residue: three rank-string formatters still exist (SQL initcap, `title()` in social.ts, `rankLabel()` in ui.tsx) — cosmetic consolidation only.
- **S1 (suspect) — magic-link origin check** in `api/auth/request-link` accepts any Origin that `endsWith(host)`; tighten to exact host comparison.
- **S2 (suspect) — `listComments`** runs its reactions query with an empty id array when a post has zero comments; verify Neon serialization of `[]` once, guard if needed.
- **C9 — `adminResolve`** computes a `table` variable then ignores it for per-table if/else branches (~8 lines).
- **Lint warnings (29):** mostly `<img>` vs `next/image`. Deliberate decision needed: Data Dragon/Blob images are external CDN assets; `next/image` would add optimization cost/complexity — either adopt it for Blob media only, or disable the rule with a comment explaining why.

---

## 6. Performance enhancement backlog for Codex (the main event)

Ordered by expected impact. Each item: what, why, approach, acceptance check. The codebase is small (~4.9k LOC) and types/tests are clean — the wins are in data-access patterns, not line count (~120 lines total were assessed removable; most are already gone).

### 6.1 Parallelize page-level data loads (D3) — ✅ DONE 2026-11-26 (second pass; home cold load 2.6s → ~1.3s, warm ~0.6s). Retained below for the record.
Home (`src/app/page.tsx`), `/u/[id]`, and `/rooms/[slug]` await independent queries strictly in series: patch → champions → feed → rooms → spotlight → trending. These have no data dependencies between them. **Approach:** `Promise.all` the independent set per page (keep genuinely dependent calls sequential). Also wrap per-request repeatable reads (`getCurrentUser`, `currentPatch`) in React `cache()` where the same value is fetched by layout + page + components in one render. **Accept:** home/profile/room server response times measurably down; identical rendered output; tests green.

### 6.2 Stop shipping full snapshots to JS for aggregation (D4/C8) — ✅ DONE 2026-11-26 (second pass). Retained below for the record.
Three implementations of the same anti-pattern: home trending (≤200 full `snapshot` JSONBs — each ~20 matches with teammates/items, the largest rows in the DB), room pulse (≤300), `todaysSpotlight` (all linked players, no LIMIT). All three only need champion-pool counts. **Approach:** one shared SQL aggregation over `jsonb_array_elements(snapshot->'champPool')` with GROUP BY, or a slim projection (`SELECT snapshot->'champPool'`) as a first step; cache the trending result briefly (it changes slowly — a 5-minute module-level or `wp_meta` cache is honest). **Accept:** trending/pulse/spotlight queries return aggregate rows only; page output unchanged; query payload per home render drops by an order of magnitude.

### 6.3 Kill the player N+1 (D5) — ✅ DONE 2026-11-26 (second pass). Retained below for the record.
`rowToPlayer` in `riot.ts` isn't exported, so `/u/[id]`, `/me`, and `primaryPlayer()` JOIN-fetch player rows and then re-fetch each via `getCachedPlayer(puuid)` — one extra query per linked player. **Approach:** export a `playerFromRow` from `riot.ts` and map JOIN rows directly; simplify `primaryPlayer` to a single query. **Accept:** profile/me renders issue a constant number of queries regardless of linked-player count.

### 6.4 `postViews` parallelism + cheap existence checks (D6)
`postViews()` (social.ts) awaits reactions, comment counts, my-votes, and poll counts in series — 4 round trips per feed render; `feed()` then runs 3 more sequential block/mute queries. **Approach:** `Promise.all` both groups. Separately, `votePoll()` and `reconfirmBuild()` call `getPost()` (full SELECT + all enrichment) just to check kind/options/authorship — replace with a targeted `SELECT kind, data, author_id FROM wp_posts WHERE id = …` (5 queries → 1 on those paths). **Accept:** feed render query count roughly halved; vote/re-confirm behavior unchanged.

### 6.5 Client bundle: lazy-load the Blob upload client (D8)
`social-ui.tsx` statically imports `upload` from `@vercel/blob/client`, so every feed viewer downloads it though only composers use it. **Approach:** dynamic `import()` inside the media-submit path. **Accept:** feed pages' first-load JS drops by the blob client's weight; media posting still works end-to-end.

### 6.6 Collapse the four copies of the post SELECT (C1) — maintainability with perf side-effects
`feed()` writes the full post SELECT (with the 4-line correlated flair subquery) three times (room/following/everyone) and `getPost()` a fourth; `feedByAuthor()` added a fifth. Neon tagged templates can't interpolate fragments, but the branches differ only in WHERE. **Approach:** single query with boolean-parameter WHERE clauses (`(${roomId}::int IS NULL OR p.room_id = ${roomId}) AND …`), or a helper that takes rows from one canonical query builder. One canonical place also fixes C4's flair drift. **Accept:** one SELECT definition; feed/getPost/by-author outputs byte-identical on fixture data.

### 6.7 One shared `postJson` (C2)
Identical fetch helpers are copy-pasted in `social-ui.tsx`, `lfg-ui.tsx`, `me-ui.tsx`, plus a variant in `admin-ui.tsx`. **Approach:** one `src/lib/client.ts`; this is also the natural home for A7's rollback-aware handling. **Accept:** four copies → one; no behavior change.

### 6.8 Cold-start schema cost (D9 remainder)
`createSchema` runs ~30 DDL statements sequentially on a cold instance (~30 round trips before the first real query). **Approach:** batch independent DDL via `Promise.all` (they are all `IF NOT EXISTS` and independent), or a single multi-statement execution if the driver allows. **Accept:** cold-start first-query latency down; schema identical.

### 6.9 Rendering strategy pass (new)
Every page is `force-dynamic`. Some surfaces are cacheable with honest staleness: `/champions`, `/guidelines`, `/terms`, `/privacy` are effectively static; the patch/champion data behind them is already module-cached. **Approach:** make policy pages static; consider ISR or `unstable_cache` for the champions grid; keep anything user-specific dynamic. Also evaluate `loading.tsx` skeletons for the main routes to improve perceived performance. **Accept:** static routes served from edge; no stale user-specific data anywhere.

### 6.10 Testing & observability gaps (new)
Only pure logic is tested. Before aggressive refactors (6.2, 6.6), add: route-level tests for the write APIs (auth/ban gates), a `postViews` fixture test to lock feed output shape, and a smoke check that runs the production build against a seeded dev DB. Vercel Analytics/Speed Insights are not enabled — enabling them gives Codex real field data to prioritize against instead of this document's estimates.

---

## 7. Verification baseline (as of this handoff)

- `npx tsc --noEmit` — clean (strict).
- `npx vitest run` — **16/16 pass** (`moderation.test.ts`, `pure.test.ts` — note: the former also tests pure helpers; renaming/splitting is a listed cosmetic item).
- `npm run lint` — runs; **0 errors, 29 warnings**.
- `npm run build` — clean production build.
- Live checks after the repair deploy (2026-11-26): cron endpoint 401 unauthenticated; previously-404 champion room (`/rooms/champ-zed`) 200; ~173 rooms listed; deleted lookup route 404; home/LFG/champions/player all 200; patch briefings present in rooms; earned badges render on the owner's player profile.
- Riot key note: the dev key expires daily (~18:40 CT) and is rotated by an external self-chaining job tied to the old project's goal tracking. **This VM's egress IP is blocked at Riot's edge** — never verify keys by calling Riot from the shell; verify through the deployed site.

## 8. Working agreements for whoever builds next

1. Deploy only from this repo (`~/workspace/ward-party`) to the `ward-party` project. A different, older codebase exists (`riftfix-rebuild-review`) for a different site — never deploy it here or this code there.
2. Never print or commit secret values; env changes go through `vercel env` with values piped via stdin.
3. Every feature must keep the §1 constraints: minimal retention, verified-by-API stats, positive-only reactions, moderation bands intact.
4. Tests + build + a live smoke check after deploy are the definition of done; report failures plainly with what was verified and what remains unverified.
5. Known external blockers (not code): Riot app 911877 approval (gates RSO + permanent key + monetization), CSAM hash-matching decision before scale, final product name still unchosen (config change when decided).

*End of handoff. Companion evidence file: `AUDIT.md` (same directory). Questions this document doesn't answer are genuinely unrecorded — check the code, not memory.*
