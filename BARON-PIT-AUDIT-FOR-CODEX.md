# Baron Pit — Round 2 Audit for Codex Review

**Date:** 2026-11-26 · **Status:** LIVE at https://ward-party.vercel.app · **Codebase:** this repo (`~/workspace/ward-party`)
**Predecessor:** `CODEX-DEEP-AUDIT.md` (round 1 — full platform audit + performance backlog). This document covers everything built *after* that handoff, plus the current state of its open items. Read round 1 for architecture, data model, and the hard product constraints (minimal retention, Riot policy walls, verified-by-API stats, positive-only reactions, moderation bands) — all still in force.

---

## 1. What changed since round 1

### 1.1 The top-three fixes (owner-directed, deployed dpl_A97eQw2oAdALQQK5xfiMv68asebM)
Round 1 §6.1/6.2/6.3 + A7 + C4 were closed by Lyris at the owner's direction (they are marked ✅ in the round-1 doc):
- **D3** — `Promise.all` parallel loads on home, room, profile, and /me pages.
- **D4/C8** — home trending and room pulse are now SQL aggregations over `jsonb_array_elements(snapshot->'champPool')`; spotlight filters `(snapshot->>'games')::int > 0` in SQL. Full snapshots no longer leave the database for counting.
- **D5** — `playerFromRow` exported from `src/lib/riot.ts`; profile/me map JOIN rows directly; `primaryPlayer()` is a single JOIN query.
- **D6 (partial)** — `postViews()`'s four enrichments and `feed()`'s three block/mute queries run in parallel. **Still open:** the `votePoll`/`reconfirmBuild` targeted-check refactor (round 1 §6.4).
- **A7** — optimistic UI rollback: `PostCard.react`/`vote` snapshot and restore state on `!ok`; `FollowButton`/`JoinButton`/`WaveButton` flip only on success.
- **C4** — all five post SELECTs compute the full `flairFor` string in SQL (rank + top-champ main, `Unranked` fallback). Verified against production data: `"Silver I · Ashe main"`. Residue: three rank formatters still exist (SQL initcap, `title()` in social.ts, `rankLabel()` in ui.tsx) — cosmetic.
- Measured: home cold load 2.6s → ~1.3s, warm ~0.6s (curl spot checks, not field data — Speed Insights still not enabled).

### 1.2 Rename: Ward Party → **Baron Pit** (owner decision 2026-11-26, after 48 brainstormed names)
- `src/lib/brand.ts` — fallback name is now "Baron Pit"; added `APP_TAGLINE = "Never take Baron alone."`. All surfaces read `APP_NAME` (wordmark, titles, footer disclaimer, metadata + favicon).
- Vercel env (Production): `NEXT_PUBLIC_APP_NAME="Baron Pit"`, `AUTH_EMAIL_FROM="Baron Pit <noreply@riftfix.com>"` (sending domain unchanged — see §3.2).
- System user (patch briefings): seed display name changed to "Baron Pit" in `systemUserId()` (`src/lib/social.ts`); the existing row renames via its `ON CONFLICT … DO UPDATE`.
- One literal string updated: `/player` page's "On Baron Pit as …" line.
- **Not renamed (deliberately):** the Vercel project (`ward-party`), the repo directory, the production URL (ward-party.vercel.app), cookie name (`wp_session`), and all `wp_` table names. A domain decision is pending (§3.3).

### 1.3 Baron theme (presentation layer only)
Threads structure untouched. `src/app/globals.css`:
- `--accent` gold → Baron void-violet (`#6d28d9` light / `#a78bfa` dark); `--accent-ink` follows.
- Victory tint/edge moved from gold to violet (`--win-tint`, `--win-edge`); defeat stays slate-blue. Earned-badge chips and flair inherit via the same variables.
- Appended "Baron Pit" CSS block: broad-room banners/tiles regraded to deep indigo→violet gradients, `.btn.gold` text forced white on violet, spotlight card gets a violet gradient + glow shadow, plus `.baron-timer`, `.baron-tag`, `.call-banner`, `.objective`/`.obj-bar`, `.brand-emblem` styles.
- Brand art on site: `/baron-emblem.png` (favicon + signed-out hero), `/baron-hero.png` (The Baron Pit room banner). Files in `public/`, copied from the art masters in the goal files.

### 1.4 Fun Baron items (round 1 of theming)
- **The Baron Pit room** — the broad room slug `general` renamed in `BROAD_ROOMS` ("The Baron Pit", tagline description). `seedRooms()` now issues an idempotent `UPDATE` so the existing production row renames without a migration. Slug unchanged (links stable).
- **Baron Buff spotlight** — home spotlight label is now "🟣 Holding the Baron buff today"; the card carries the violet glow treatment.
- **Baron respawn timer** — `BaronTimer` client component (`src/components/social-ui.tsx`, appended): cycles on Baron's real 6-minute respawn clock (`360 - (epochSeconds % 360)`), flips to "BARON IS UP — group up!" for the last 6 seconds of each cycle. Pure theater; renders nothing server-side (null until mounted).
- **💜 reaction** — added to `REACTION_EMOJIS` in `src/lib/pure.ts` (single source; server validation and client picker both read it). Set is now 🔥 ❤️ 👏 🎯 💜 GG — still positive-only.

### 1.5 Baron features (round 2 — this session's build, deployed dpl_CLgYJcG1PFPzFSUBRivUYErZZ5Rh)
1. **Baron data in snapshots.** `MatchSummary.baron?: boolean` (`src/lib/pure.ts`). `src/lib/riot.ts` now types `info.teams[].objectives.baron.kills` and sets `baron` from the player's own team's objective count at fetch time. Display-only, same recent-20 snapshot, no new storage — minimal retention preserved. Older cached snapshots simply lack the field (all consumers treat it as optional).
   - **"🟣 Baron secured" tag** renders on game cards (`MatchCard` in social-ui.tsx) and on /player last-3 rows when `baron` is true.
   - **"Baron caller · N secured" earned badge** in `earnedBadges()` (pure.ts): team's Baron secured in ≥5 of the snapshot's games. New unit test added (17/17 total). **Verified live with real data:** the owner's refreshed snapshot produced "Baron caller · 10 secured".
2. **Make the Call.** Composer poll tab gains a "🟣 Make it a Baron call" toggle (`call` state in `Composer`): presets options to Baron / Dragon / Push the inhib / Reset & farm and stamps `data.call = true`. Server-side, poll validation already whitelists shape only (2–4 options ≤60 chars); the flag rides in the post's `data` JSONB. `PostCard` renders a "🟣 The Call — the pit decides" banner above call polls. No schema change.
3. **Hand of Baron profile badge.** `/u/[id]` computes `todaysSpotlight(today)` (one extra cached-seed query on profile renders) and, when the profile owner is today's spotlight owner, shows "🟣 Hand of Baron — holding the buff today" as the first badge chip. Note: spotlight requires a linked player (`wp_links` JOIN) — with zero links in production today, the badge and the home spotlight are dormant until the first link exists (see §3.4).
4. **Daily community objective.** Home page runs one aggregate query (five `count(*)` subselects over today's posts/builds/one-fix comments/LFG listings/reactions, `created_at::date = CURRENT_DATE`) inside the existing parallel block, picks one of five objectives by `dayIndex = floor(epochDays) % 5`, and renders a violet progress strip ("Today's objective … n/target", "Objective secured — the pit provides. 🟣" at completion). **Verified live** (today's rotation: "Open 8 duo listings").

### 1.6 Art (provenance matters for review)
- **Canva produced nothing this round:** the account's Canva AI credits are exhausted (100% used; reset ~2026-12-01). The earlier Ward Party launch graphic (design `DAHb_35UxOU`) remains the only Canva asset.
- **Runway (nano-banana-pro) produced both Baron Pit pieces** under the owner's explicit instruction: the emblem (task `5254959c-8468-4a76-b52a-5d41f490e510`) and the hero (task `f571ce92-6cb1-4642-85b0-08d473bb1346`). Masters: `~/workspace/ward-party/docs/art/baron-pit-{emblem,hero}-runway.png`; site copies in `public/`. Both were visually inspected before shipping — original serpent-in-pit artwork, no Riot assets, no text artifacts.
- The standalone golden-ward **mascot** from round 1 was still **not** generated (its approval timed out; the owner has not re-approved it — the Baron art above is a separate, approved request).

---

## 2. Verification evidence (this round)

- `npx tsc --noEmit` — clean. `npx vitest run` — **17/17** (new: Baron caller badge). `npm run lint` — 0 errors, 31 warnings (round 1 had 29; the +2 are `<img>` warnings for the new brand art — same open decision as round 1 §5.4). `npm run build` — clean.
- Live checks after the final promote: home 200 with the objective strip and timer mount point; /rooms/general 200 with hero banner and "The Baron Pit" ×8; both art assets 200; player page for the owner returned a fresh snapshot carrying `baron` data and the Baron caller badge.
- Deploys this round: dpl_A97eQw2oAdALQQK5xfiMv68asebM (fixes), dpl_HdAhEWuua6NpYVSp9EbXM9BrMFa9 (rename/theme), dpl_4dmN4NUL9WPvEcMYf1NrnwatCkLo (art wired in), dpl_CLgYJcG1PFPzFSUBRivUYErZZ5Rh (Baron features).

## 3. State Codex should know before touching anything

1. **Riot key rotation is external and time-critical.** The 24-hour dev key is rotated by a self-chaining scheduled job (currently titled for the old venture; it maintains the `ward-party` project's key and verifies through this site's /player page). The chain stops only when Riot approves production app **911877** (still Pending Review — it also gates RSO verified linking and any monetization). Do not hardcode keys; this VM's egress is blocked at Riot's edge, so never verify keys from the shell.
2. **Email depends on the riftfix.com domain.** Sign-in mail sends from `noreply@riftfix.com` (Resend domain verified under that name). The owner has ordered the old RiftFix venture deleted; the deletion is **paused on the owner's scope decision** because the domain, the key-rotation job's ownership, and several Baron Pit source documents currently live under the old venture's containers. Until the owner rules, do not delete the Resend domain, the domain registration, or the rotation job.
3. **No Baron Pit domain yet.** Production is ward-party.vercel.app. All obvious baronpit domains were registered at last check — a purchase/choice decision for the owner, after which `NEXT_PUBLIC_APP_NAME` is already correct and only DNS + project domain change.
4. **Production data is nearly empty by design of launch timing:** `wp_links` has **0 rows** (no user has completed a Riot link yet — including the owner), so link-dependent surfaces (spotlight, Hand of Baron, flair on posts, LFG) are dormant, not broken. `wp_players` holds lookup snapshots only.
5. **Round-1 leftovers still open** (unchanged, in priority order): D6 remainder (§6.4 targeted checks), D8 (lazy-load the Blob client), C1 (collapse the five post SELECTs — now six copies of the flair expression after C4; consolidation is *more* valuable, not less), C2 (shared `postJson` — A7 made the copies slightly more divergent), 6.8 cold-start DDL batching, 6.9 rendering strategy, 6.10 tests/observability (Speed Insights), S1 (magic-link origin `endsWith` tightening), S2 (empty-array comments query), the CSAM hash-matching decision before any scale push.

## 4. Specific review asks for Codex

1. **The flair SQL expression** (×5 copies in `src/lib/social.ts`): confirm the `champPool->0` extraction matches `flairFor()` for edge cases — empty champPool, missing snapshot, rank present but pool absent — and fold into the C1 consolidation if you do it.
2. **`BaronTimer` interval math**: it assumes a global 6-minute phase aligned to epoch; confirm no drift/off-by-one at the "up" window boundary, and that the 1s interval is cleaned up on unmount (it is — verify anyway).
3. **Objective query cost**: five correlated subselects run on every home render. At real volume this wants an index on `created_at` per table or a single-pass aggregate — assess and fix if you agree.
4. **`todaysSpotlight` on profile pages**: added one query to /u renders; with the D5 work it may now be the slowest call on that page. Consider folding the spotlight owner into an existing query or caching by date.
5. **Snapshot `baron` backfill**: none exists by design (fields appear on natural refresh within the 10-minute TTL). Confirm no consumer breaks on mixed old/new snapshots in the same feed — `MatchCard` and the player rows were the only readers found.
6. **Poll `data.call` trust**: the flag is client-supplied and only affects rendering (a banner). Confirm no path lets a non-poll post render the banner or a poll smuggle other unvalidated `data` keys into rendering.

*End of round-2 audit. Round-1 document: `CODEX-DEEP-AUDIT.md` (same directory). Anything not recorded here or there is genuinely unrecorded — check the code, not memory.*
