# Ward Party — Code Audit (2026-11-26)

Scope: full tree read — `src/**`, `package.json`, `next.config.ts`, `tsconfig.json`, `vercel.json`.
Method: manual read of every file + `npx tsc --noEmit` + `npx vitest run` + grep cross-checks for every dead-code claim.
**No files were edited.** Line numbers refer to the tree as audited.

## Tool results (baseline health)

- `npx tsc --noEmit` — **clean**, exit 0. TypeScript strict mode is on and passing.
- `npx vitest run` — **16/16 tests pass** (2 files: `src/lib/moderation.test.ts`, `src/lib/pure.test.ts`).
- `npm run lint` — **broken**: ESLint 9 is installed but there is no `eslint.config.*` (or legacy `.eslintrc*`) anywhere in the repo, so the script errors out immediately (`ls eslint.config.* .eslintrc*` → no such files). Lint has effectively never run on this codebase.

Overall shape: the code is not the mess it feels like from the outside — types are clean and tests pass. The real problems are (1) a handful of genuine correctness/security bugs, (2) three expensive data-access patterns repeated everywhere, and (3) a long tail of small duplications. Details below, all evidenced.

---

## (A) Confirmed bugs

### A1. Profile pages silently lose posts — "No posts yet" for active users
- **Severity: High (user-visible correctness).**
- `src/app/u/[id]/page.tsx:45-46`:
  ```ts
  const allPosts = await feed(viewer, "everyone", undefined, 60).catch(() => []);
  const posts = allPosts.filter((p) => p.authorId === userId).slice(0, 20);
  ```
- A profile's post list is computed by fetching the **60 most recent posts site-wide** and filtering by author in JS. Any user whose posts fall outside the global 60 newest sees an empty profile. Gets worse with every post anyone makes.
- **Fix:** add a `feedByAuthor(userId, viewer, limit)` query in `social.ts` (same SELECT shape, `WHERE p.author_id = …`), or extend `feed()` with an `authorId` parameter.

### A2. ~150 broken room links — only 16 champion rooms exist, but every champion links to one
- **Severity: High (user-visible, sitewide).**
- Rooms are seeded from `LAUNCH_CHAMPION_ROOMS` — exactly 16 champions (`src/lib/social.ts:44-47`). But:
  - `src/app/champions/page.tsx` renders a **Room** link for **every** champion in Data Dragon (~170) and its copy claims "Every champion has a room" — ~154 of those links hit `getRoom() → null → notFound()` (`src/app/rooms/[slug]/page.tsx:14-15`).
  - `src/app/page.tsx` (Trending champions) links `/rooms/champ-${champion.toLowerCase()}` for any champion appearing in tracked snapshots.
  - `src/app/player/page.tsx` champion-pool rows and the Most-Played showcase link the same pattern for any champion in a player's pool.
- **Fix:** either seed rooms for all champions (cheap — rooms are rows, and the room page already has a "room pulse" empty state), or gate the links to the 16 seeded slugs. Seeding all is the better product answer and makes the /champions copy true.

### A3. A failed/partial Riot refresh overwrites a good cached snapshot with empty data
- **Severity: High (data loss on transient errors).**
- `src/lib/riot.ts:125-190` (`lookupPlayer`): when the cache is stale, it refetches. If the account call succeeds but the summoner/league/match calls fail or return non-200 (rate limit, Riot outage, key mid-rotation), the code proceeds with `level = 0`, rank fields `null`, and `matches = []` → `summarize([])` → `EMPTY_SNAPSHOT`, and then **unconditionally upserts** over the previously good row (`INSERT … ON CONFLICT DO UPDATE`, lines 175-189). One bad refresh wipes a player's displayed rank, level, and form until the next good refresh.
- **Fix:** if the match-id fetch or the batch yields zero matches while a cached row exists, return the cached player (or abort the upsert); only overwrite when the fresh fetch actually produced data. Also treat a failed summoner call the same way.

### A4. Cron endpoint `/api/cron/patch-watch` has no authentication
- **Severity: Medium-High (security).**
- `src/app/api/cron/patch-watch/route.ts` (whole file): the `GET` handler calls `runPatchWatch()` with **no check** of Vercel's cron `Authorization: Bearer $CRON_SECRET` header (or any secret). Anyone on the internet can invoke it. Blast radius is limited by idempotency (briefings only post when the patch actually changes, tracked in `wp_meta`), but an unauthenticated trigger for a content-posting job should not ship.
- **Fix:** reject unless `authorization` header equals `Bearer ${process.env.CRON_SECRET}` (set CRON_SECRET in the project env; Vercel sends it automatically).

### A5. Game-card ("share a game") stats are forgeable — server validates the matchId, then trusts the client's match object
- **Severity: Medium (integrity — cuts at the product's "stats tell the truth" premise).**
- `src/lib/social.ts:176-182` (`createPost`, `kind === "card"`): the server checks only that `data.matchId` exists in the player's cached snapshot. The rendered payload, `data.match` (champion, W/L, K/D/A, CS, items), is **client-supplied and never compared to the snapshot**. `MatchCard` (`src/components/social-ui.tsx`) renders `data.match` verbatim. Anyone can POST a card claiming a 30/0/5 game on any champion as long as they pair it with one real recent matchId.
- **Fix:** in `createPost`, look up the match in the snapshot by matchId and **overwrite** `data.match` with the server-side snapshot values (and `data.riotId` with the cached player's name) before insert.

### A6. Suspended (banned) users keep most write actions — `isBanned` is checked on only 5 of ~16 write routes
- **Severity: Medium (moderation enforcement hole).**
- Routes **with** the ban check: `api/social/post`, `api/social/comments` (POST), `api/lfg`, `api/social/upload`, `api/social/builds/reconfirm`.
- Routes **without** it (verified by reading each): `api/social/follow`, `api/social/react`, `api/social/vote`, `api/social/endorse`, `api/social/report`, `api/social/block`, `api/social/mute`, `api/social/room-join`, `api/account/link`, `api/account/profile`, `api/account/unlink`. A user suspended via the admin queue's 7-day ban can still follow, react, vote, endorse, join rooms, edit their profile, and link/unlink Riot IDs for the whole suspension.
- **Fix:** one shared guard (see C3) applied to every write route.

### A7. Optimistic UI never rolls back — failed writes look successful
- **Severity: Medium-Low (correctness/trust).**
- `src/components/social-ui.tsx`: `PostCard.react()` and `vote()` update local state, then `await postJson(...)` and **ignore the result**. `FollowButton` flips to "Following" regardless of `ok`; `JoinButton` flips without even reading the result. `src/components/lfg-ui.tsx` `WaveButton` sets `waved` unconditionally. On any failure (401 after session expiry, 403 while banned, 500), the UI lies until the next refresh.
- **Fix:** capture the result; on `!ok`, revert the optimistic state (and for reactions, optionally route to /signin like the signed-out path already does).

### A8. YouTube Shorts (and `v`-less) clip links render a blank player
- **Severity: Low-Medium.**
- `createPost` accepts any `youtube.com` URL (`CLIP_HOSTS`, `src/lib/social.ts:143`). `ClipEmbed` (`src/components/social-ui.tsx`, `ClipEmbed` fn) builds the embed from `u.searchParams.get("v") ?? ""` — for `youtube.com/shorts/<id>` or `/live/<id>` links there is no `v`, producing `https://www.youtube.com/embed/` (empty id) → blank iframe instead of the link fallback.
- **Fix:** parse `/shorts/<id>` and `/live/<id>` path forms; if no id can be extracted, fall through to the plain-link rendering.

### A9. `addComment` never checks that `parentId` belongs to the same post
- **Severity: Low (data integrity).**
- `src/lib/social.ts` `addComment`: `parentId` is inserted unchecked. A reply can reference a comment on a different post; `listComments` then promotes it to a root comment on this post (parent not in the post's comment map). No cross-post leak of content, but thread structure can be corrupted by a crafted request.
- **Fix:** verify `parentId` exists in `wp_comments` with `post_id = postId` before insert.

### A10. Moderation profanity matcher has no trailing word boundary — false positives on innocent words/names
- **Severity: Low.**
- `src/lib/moderation.ts:71-73`: profanity test is `new RegExp("(^|[^a-z])" + w)` with **no trailing boundary**, so "dick" matches "Dickens" / the name "Dick", "ass" -class substrings aren't in the list but e.g. "cum" -style prefixes would hit if added. Each hit is only +12 (hold band needs ≥30), so impact today is score inflation, not wrongful blocks — but display names go through a stricter pass in `api/account/profile`, where a name containing such a substring can be rejected outright when combined with any other signal.
- **Fix:** add the same `([^a-z]|$)` trailing boundary the slur matcher already uses.

### Suspects — verify before acting
- **S1. Magic-link origin check is sloppy.** `src/app/api/auth/request-link/route.ts:7-9` accepts any `Origin` that `endsWith(host)`, and the emailed link's base URL is built from that Origin. Exploitation looks constrained (Host is platform-set; an attacker would need a domain ending in the real host string), but the check should be an exact host comparison. *Suspect — verify.*
- **S2. `listComments` runs its reactions query with an empty id array** when a post has zero comments (`target_id = ANY(${[]})`, `src/lib/social.ts` `listComments`). Neon/Postgres should treat an empty array as "no rows", but the driver's serialization of `[]` is worth one live check. *Suspect — verify.*
- **S3. Magic-link redemption race.** `redeemMagicLink` (`src/lib/auth.ts:71-93`) SELECTs the unused token, then UPDATEs `used_at` in a separate statement without `AND used_at IS NULL` in the UPDATE — two concurrent clicks on the same link can both redeem (two sessions). Low impact (same user), one-line fix: make the UPDATE conditional and check the row count. *Suspect — standard race, not reproduced.*

---

## (B) Dead code — verified unused

Every item below was grep-verified against the whole `src` tree.

| # | Item | Location | Evidence |
|---|------|----------|----------|
| B1 | `PALETTE` export (the old warm-paper palette, pre-Threads redesign) | `src/lib/brand.ts:14-26` | `grep -rn PALETTE src` → only the definition. Zero importers. |
| B2 | `APP_TAGLINE` export | `src/lib/brand.ts:9` | Zero usages outside brand.ts. |
| B3 | `bestGame()` export | `src/lib/riot.ts:196-204` | `grep -rn bestGame src` → only the definition. (Its KDA-sort logic lives on in `dailyHighlight` — see C5.) |
| B4 | `itemIconUrl()` export | `src/lib/riot.ts` (Data Dragon section) | Zero call sites; all item images inline the URL template instead (see C6). |
| B5 | `rotationIndex()` — production-dead | `src/lib/pure.ts:183-187` | Only remaining references are in `src/lib/moderation.test.ts:3,45-46`. Production code uses the duplicate `seedFrom` in social.ts instead (C5). Either keep it and use it, or delete both it and its test. |
| B6 | `/api/player/lookup` route — no caller in the app | `src/app/api/player/lookup/route.ts` (16 lines) | `grep -rn "api/player/lookup" src` → zero hits. The /player page calls `lookupPlayer()` server-side directly. The route is a public, unauthenticated surface (with a `force=1` cache-bypass — see D7) that nothing uses. Delete or gate it. |
| B7 | Dead DB columns: `wp_players.flex_tier / flex_div / flex_lp` | `src/lib/db.ts` (wp_players DDL) | `grep -rn "flex_tier\|flexTier\|flex_div\|flex_lp" src` → only the DDL. Never written (the lookup INSERT doesn't list them), never read, no field on the `Player` type. Flex rank was evidently planned and never built. |
| B8 | Dead DB column: `wp_posts.edited_at` | `src/lib/db.ts` (wp_posts DDL) | Zero references outside the DDL; there is no post-editing feature. |
| B9 | Dead CSS: `.btn.gold` rule | `src/app/globals.css:159` | The rule sets `background: var(--ink); color: var(--bg); border-color: var(--ink)` — identical to base `.btn`. The `gold` class is used in markup (LookupForm, ShareCardButton, WaveButton) but does literally nothing. Either give it the gold styling or drop the rule and the class. |
| B10 | Dead CSS: `--radius` variable | `src/app/globals.css:25` | `grep -c "var(--radius)"` → 0 uses. |
| B11 | Dead CSS: `.room-grid { display: block; }` | `src/app/globals.css` (Rooms section) | A `div` is `display:block` by default; the rule is a no-op (the class is used in rooms/page.tsx, the rule itself does nothing). |
| B12 | Dead CSS selector: `.showcase .overlay .meta` | `src/app/globals.css` (showcase block) | The showcase overlay markup (`src/app/player/page.tsx`) uses inline styles only — no `.meta` element exists inside `.overlay`. |
| B13 | Dead config: Next image config | `next.config.ts` | `grep -rn "next/image" src` → 0. Nothing uses `next/image`, and the `raw.communitydragon.org` remote pattern is referenced nowhere (`grep communitydragon src` → 0). All images are plain `<img>` with hand-built URLs. The whole `images` block is inert. |
| B14 | Trivial dead expression | `src/components/social-ui.tsx` Composer | `rows={kind === "text" ? 2 : 2}` — both branches are 2. |

CSS overall is otherwise clean: all 78 top-level classes in globals.css are referenced in markup (verified by cross-grep) — the stylesheet is **not** a dead-code problem beyond B9-B12.

---

## (C) Consolidations

### C1. The post SELECT (with flair subquery) is written out 4 times — ~36 lines of SQL
- `src/lib/social.ts`: `feed()` contains **three** near-identical full SELECTs (room / following / everyone branches, ≈ lines 257-300), and `getPost()` repeats the same SELECT a **fourth** time. Each copy includes the same 4-line correlated flair subquery. The code comment above `feed()` explains why a shared fragment can't be interpolated into Neon's tagged templates — true for *fragments*, but the three `feed()` branches differ **only in their WHERE clause**, and `getPost` only in WHERE + LIMIT.
- **Fix:** one `queryPosts(whereClause…)` is awkward with tagged templates, but the branches can be collapsed: build the rows with a single query whose WHERE uses boolean parameters (e.g. `WHERE p.status='visible' AND (${roomId}::int IS NULL OR p.room_id = ${roomId}) AND …`), or accept a small internal helper that takes an already-built `rows` promise. Realistic saving: **~25-30 lines**, and — more important — one place to fix the flair logic (see C4).

### C2. `postJson` is copy-pasted into 4 component files — ~20 lines
- Identical implementations: `src/components/social-ui.tsx:10`, `src/components/lfg-ui.tsx:10`, `src/components/me-ui.tsx:7`; a boolean-returning variant in `src/components/admin-ui.tsx:6`.
- **Fix:** one `src/lib/client.ts` (or `components/http.ts`) exporting `postJson`; admin-ui's variant becomes `postJson(...).then(r => r.ok)`. Saving ~15 lines and one behavior to fix (e.g. A7's rollback handling, error shapes).

### C3. The auth guard preamble is repeated in all ~20 API routes — ~60 lines, and it's why A6 happened
- Nearly every route opens with the same 3-5 lines: `getCurrentUser()` → 401 JSON; some add `isBanned` → 403, most don't (bug A6 is the direct consequence of copy-paste guards drifting).
- **Fix:** a `requireUser(req, { banned?: boolean })` helper (or a small `withUser(handler)` wrapper) in `src/lib/auth.ts` returning `{ user }` or a ready `NextResponse`. Apply uniformly; A6 disappears structurally.

### C4. Two different flair implementations that disagree
- SQL (feed/getPost): flair = rank only, e.g. `"Gold IV"` (initcap tier + div, no main, no LP).
- TS `flairFor()` (`src/lib/social.ts:121-126`), used on `/u/[id]`: flair = `"Gold IV · Ashe main"`.
- The same user shows different flair in the feed vs on their profile. Pick one (the TS one is richer); if the SQL stays, make it produce the same string, or compute flair in `postViews` from a joined snapshot column. Also note `title()` in social.ts re-implements the title-casing that `rankLabel()` in `components/ui.tsx` already does — three rank-string formatters exist in total (SQL initcap, `flairFor`/`title`, `rankLabel`).

### C5. The FNV-1a hash + "pick by KDA" logic is implemented 3 times
- Hash: `pure.ts:184` (`rotationIndex`) and `social.ts:567-571` (`seedFrom`) are the same FNV-1a loop; `seedFrom` exists because `dailyHighlight`/`todaysSpotlight` needed the raw hash. Make `pure.ts` export `fnvHash(str)` and have both call it; delete one copy (~6 lines).
- "Best game by KDA": `riot.ts` `bestGame()` (dead, B3) and `social.ts` `dailyHighlight()` both sort matches by `(kills+assists)/max(1,deaths)`. One helper in `pure.ts` (`byKdaDesc`) serves both.

### C6. Data Dragon URL templates are inlined 8 times while helpers exist and are ignored
- `grep "ddragon.leagueoflegends.com/cdn/\${"` → **8 inline template URLs** across `player/page.tsx`, `social-ui.tsx`, `lfg-ui.tsx` (item icons, champion icons), bypassing `championIconUrl` (10 call sites do use it) and the never-called `itemIconUrl` (B4). Route everything through the helpers in `riot.ts` (or a client-safe `ddragon.ts` — see D8) and the inconsistency disappears.

### C7. Constants duplicated between server and client because they live in a server module
- `REACTION_EMOJIS` (`social.ts:27`) is re-typed as a literal array in `social-ui.tsx:326` (`["🔥","❤️","👏","🎯","GG"]`).
- `ENDORSE_KINDS` (`social.ts:28-32`) is re-typed in `social-ui.tsx` `EndorseRow` (~line 487) — and the copies have **already drifted**: labels differ (client adds emoji prefixes).
- Client components can't import runtime values from `social.ts` (server module), which is why the copies exist. **Fix:** move both constants into `pure.ts` (client-safe, already imported by both sides) and import from there.

### C8. Three separate "load all snapshots and aggregate in JS" implementations
- Home trending (`src/app/page.tsx:27-34`): loads up to 200 full snapshot JSONBs, counts champPool games in JS.
- Room pulse (`src/app/rooms/[slug]/page.tsx:26-40`): loads up to 300 full snapshots, aggregates one champion in JS.
- `todaysSpotlight` (`src/lib/social.ts:583-596`): loads **all** linked players' full snapshots, filters in JS.
- One shared helper (or one SQL query using `jsonb` aggregation over `snapshot->'champPool'`) replaces all three patterns. See D4.

### C9. `adminResolve`'s table if/else duplication
- `src/lib/social.ts` `adminResolve`: the `table` variable is computed, then ignored in favor of per-table if/else branches for approve/remove (the Neon template constraint again). Minor; ~8 lines recoverable with two tiny statement helpers. Low priority.

### C10. riot.ts re-export indirection
- `src/lib/riot.ts:10-15` re-exports `PLATFORMS`, `isPlatform`, `summarize`, `EMPTY_SNAPSHOT` from `platforms.ts`/`pure.ts`. Every importer actually imports them from `@/lib/riot` (verified in the import grep), so the re-exports are load-bearing today — but they're pure indirection: importers could import from the source modules directly, shrinking riot.ts's surface and making the client/server boundary clearer. Cosmetic; do it while doing C6/C7.

**Estimated total removable/consolidatable: ~120 lines** (B-items ≈ 55, C1 ≈ 28, C2 ≈ 15, C5 ≈ 8, C9 ≈ 8, C10 ≈ 4, plus misc), out of ~4,780 total — about 2.5%. The codebase is not bloated; the wins are in behavior (Section D), not line count.

---

## (D) Performance

### D1. `ensureRooms()` runs 21 sequential INSERTs on every room read — the single most expensive pattern in the app
- `src/lib/social.ts:48-60`: `ensureRooms()` loops 5 broad + 16 champion rooms, one awaited `INSERT … ON CONFLICT DO NOTHING` each = **21 sequential DB round trips**.
- It is called at the top of **both** `listRooms()` and `getRoom()`. Call sites: home page (`listRooms`), /rooms (`listRooms`), room page (`getRoom` **and** `listRooms` → **42 inserts per room-page render**), search (`listRooms` via `searchAll`), and the link route — which calls `getRoom` up to 4 times per link (General + top-3 champs) → **up to 84 inserts to join 4 rooms**.
- **Fix:** memoize like the schema (module-level `roomsEnsured` promise in social.ts, reset never), or check `SELECT count(*) FROM wp_rooms` first and seed only when empty. One-line-of-defense version: `let roomsReady: Promise<void> | null`. Expected saving: 20-80 round trips per affected request.

### D2. `getCurrentUser()` performs a DB **write** on every authenticated request
- `src/lib/auth.ts:96-112`: after the session lookup, it unconditionally runs `UPDATE wp_users SET last_seen_at = now()`. The root layout calls `getCurrentUser()` on **every page render**, and every API route calls it too — so every click costs a session SELECT **plus a row UPDATE** (write + WAL churn on Neon) just to render.
- **Fix:** throttle the touch — only update when `last_seen_at` is older than ~5 minutes (fold the condition into the UPDATE's WHERE), or drop the write entirely (nothing in the codebase reads `last_seen_at` — verified: no other reference to it in `src` outside auth.ts and the DDL).

### D3. Home page runs its data loads strictly in series, several unnecessarily heavy
- `src/app/page.tsx:16-35`: `currentPatch()` → `championList()` → `feed()` → `listRooms()` → `todaysSpotlight()` → trending query, all awaited sequentially. `feed`, `listRooms`, `todaysSpotlight`, and the trending scan are independent — `Promise.all` cuts the page to the slowest single query. Same pattern (sequential independent awaits) in `u/[id]/page.tsx` (followCounts → endorsementCounts → primaryPlayer → isFollowing → linkRows → feed) and `rooms/[slug]/page.tsx`.

### D4. Full-snapshot table scans shipped to JS for aggregation (see C8)
- Home trending pulls up to 200 complete `snapshot` JSONB documents (each ~20 matches with teammates/items — the largest rows in the DB) on **every home render** just to count champion games; room pulse does 300; spotlight does all linked players with no LIMIT. As the player cache grows this dominates page latency and Neon data transfer (ironic, given the old project's DB died of a transfer cap).
- **Fix:** aggregate in SQL (`jsonb_array_elements(snapshot->'champPool')` + GROUP BY), or maintain a tiny `wp_meta`-style counter. At minimum add `ORDER BY fetched_at DESC` + smaller limits and select only `snapshot->'champPool'`.

### D5. N+1: linked-player loops re-fetch rows the query already returned
- `src/app/u/[id]/page.tsx:38-44` and `src/app/me/page.tsx:19-25`: `SELECT p.* FROM wp_links l JOIN wp_players p …` already returns every player column — then the code loops and calls `getCachedPlayer(puuid)` per row (one extra query each) because `rowToPlayer` isn't exported from riot.ts. `primaryPlayer()` (`social.ts:113-117`) does the same two-step. **Fix:** export `rowToPlayer` (as `playerFromRow`) from riot.ts and map rows directly; or have the JOIN return and convert in place. Saves N queries per profile/me render.

### D6. `postViews()` runs its 4 enrichment queries sequentially; `votePoll`/`reconfirmBuild` pay full post-view cost for a check
- `src/lib/social.ts` `postViews`: reactions, comment counts, my votes, poll counts — independent queries awaited in series (4 round trips per feed render). `Promise.all` them.
- `votePoll()` and `reconfirmBuild()` call `getPost()` — the full SELECT **plus** all 4 postViews queries — just to verify kind/options/authorship. A 6-line targeted query (`SELECT kind, data, author_id FROM wp_posts WHERE id = …`) replaces 5 queries with 1 in both paths.
- `feed()`'s block/mute filtering also runs 3 sequential queries after the main query (blocked-by-me, blocked, muted) — fold into one query or `Promise.all`.

### D7. Unauthenticated cache-bypass on player refresh burns the shared Riot dev-key quota
- `/player?force=1` (linked publicly as "Refresh stats" on every player page) and the dead `/api/player/lookup?force=1` (B6) both skip the 10-minute cache (`CACHE_TTL_MS`, `riot.ts`) with **no auth and no rate limit**. Each forced lookup costs up to ~9 Riot API calls (account + summoner + league + ids + up to 5 match batches… actually 1 + 3 + up to 20 match fetches in batches). Anyone (or any bot) can loop it and exhaust the dev key's rate limits for all users — the exact failure mode this project already lives with daily.
- **Fix:** require sign-in for `force`, or add a per-IP/per-player cooldown (e.g. force allowed once per 10 min per player, tracked via `fetched_at`).

### D8. Client bundle hygiene is mostly fine — one watch item
- Client components import only **types** from `@/lib/social` (`import type { PostView, CommentView }` in social-ui.tsx; `import type { LfgListing }` in lfg-ui.tsx) — correctly erased at build, no server code (or Neon driver) leaks into the browser bundle. `samePatch`/`SCHEDULE_BLOCKS` come from client-safe `pure.ts`. Good.
- Watch item: `social-ui.tsx` imports `upload` from `@vercel/blob/client` at the top of the module that also renders every PostCard — the blob client ships to every feed viewer. Minor; a dynamic import inside the Composer's media path would trim it.

### D9. Schema bootstrap: correct pattern, two sharp edges
- `src/lib/db.ts:19-28`: `createSchema` runs **once per process** via a cached promise — the right design (28 DDL statements only on cold start, though they're awaited **sequentially**, adding ~28 round trips to every cold start; they could be batched/parallelized).
- Sharp edge 1: if `createSchema` **rejects once** (transient Neon error), `schemaPromise` stays rejected forever — every query in that instance fails until the instance is recycled. Clear the cached promise on rejection.
- Sharp edge 2: the same pattern in `getSql` means the first request to a cold instance pays schema + query serially. Acceptable; note only.

### D10. Missing indexes for three recurring query shapes
Current indexes are sensible for feed/room/comments. Gaps (impact grows with data):
- `wp_reactions (target_kind, target_id)` — postViews aggregates by target on every feed render; the PK leads with `user_id`, so these are seq scans.
- `wp_links (puuid)` — the player page's owner lookup (`WHERE l.puuid = …`) can't use the `(user_id, puuid)` PK.
- `wp_reports (target_kind, target_id, status)` — `reportTarget` counts open reports per target on every report.
- `wp_mod_log (author_id)` — `myNotices` filters by author.
All are one-line `CREATE INDEX IF NOT EXISTS` additions in db.ts.

### D11. `currentPatch()` / `championList()` caching is fine
- Module-level caches (6h / 24h) in `riot.ts` — verified, no per-request refetch. The `cache: "no-store"` on the underlying fetches is correct given the manual cache. Only nit: the hardcoded fallback patch `"16.23.1"` will silently age; harmless because it's only used when Data Dragon is unreachable.

---

## (E) Prioritized fix list

### P0 — fix first (correctness & security)
1. **A1** — Profile post lists: replace the global-feed filter on `/u/[id]` with a real by-author query.
2. **A2** — Broken champion-room links: seed rooms for all champions (or gate links to existing rooms) — /champions, home trending, player pool/showcase.
3. **A3** — `lookupPlayer`: never overwrite a good cached snapshot with an empty/failed refresh.
4. **A4** — Authenticate `/api/cron/patch-watch` (CRON_SECRET bearer check).
5. **A5** — Game cards: overwrite client-supplied `data.match` with snapshot values server-side in `createPost`.
6. **A6** — Apply the ban check to every write route (do it via C3's shared guard and it can't drift again).

### P1 — performance & consistency (do with the P0 pass)
7. **D1** — Memoize `ensureRooms()` (biggest single latency win: −20 to −84 queries per request).
8. **D2** — Stop writing `last_seen_at` on every request (throttle or remove; nothing reads it).
9. **D7** — Gate `force=1` refreshes (auth or per-player cooldown).
10. **D3/D6** — `Promise.all` the independent loads on home, profile, and room pages; parallelize `postViews` and feed's block/mute queries.
11. **D4/C8** — Replace the three JS snapshot-scan aggregations with one SQL/jsonb aggregation helper.
12. **D5** — Export `rowToPlayer`; kill the getCachedPlayer N+1 loops on /u/[id], /me, `primaryPlayer`.
13. **C4** — One flair implementation, one string, everywhere.
14. **A7** — Roll back optimistic UI on failed writes (react/vote/follow/join/wave).
15. **A8** — ClipEmbed: handle YouTube Shorts/live URL forms.
16. **D9** — Clear the cached schema promise on rejection in db.ts.
17. **D10** — Add the four missing indexes.

### P2 — cleanup & consolidation (the "less code" pass)
18. **B1-B14** — Delete the dead code: PALETTE, APP_TAGLINE, bestGame, itemIconUrl (or use it — C6), rotationIndex + its test (or use it — C5), the unused `/api/player/lookup` route, flex_* and edited_at columns, `.btn.gold` / `--radius` / `.room-grid` / `.showcase .overlay .meta` CSS, the inert `images` block in next.config.ts, the `rows={… ? 2 : 2}` ternary.
19. **C2** — One shared `postJson` in a client lib module (4 copies → 1).
20. **C3** — One shared route guard (folds into P0 #6).
21. **C1** — Collapse feed/getPost's four SELECT copies into one query path (~28 lines).
22. **C5/C7** — Single FNV hash + KDA-sort helper in pure.ts; move REACTION_EMOJIS and ENDORSE_KINDS into pure.ts so client and server share one copy.
23. **C6** — Route all Data Dragon URLs through `championIconUrl`/`itemIconUrl`.
24. Restore `npm run lint`: add an `eslint.config.mjs` (flat config from `eslint-config-next`) so lint actually runs.
25. Small integrity items: **A9** (comment parent/post check), **A10** (profanity trailing boundary), **S3** (conditional magic-link UPDATE), reaction targets existence check in `toggleReaction`.
26. Rename `src/lib/moderation.test.ts` (it also tests pure.ts helpers) or split it — cosmetic, prevents future confusion.

*End of audit. All claims verified against the tree on 2026-11-26; items marked "suspect — verify" (S1-S3) are code-reading inferences that were not reproduced live.*
