# Baron Pit — Audit Round 3 + Instructions for Codex

**Date:** 2026-11-26 (~2:25 PM CT) · **Auditor:** Lyris (live-site walk + read-only code audit)
**Companion docs:** `README.md`, `CODEX-DEEP-AUDIT.md` (round 1), `BARON-PIT-AUDIT-FOR-CODEX.md` (round 2), and Jay's product brief to Codex (Threads teardown → gap analysis → autonomous build, cosmetics/flow first). This document is the *evidence pack* for that brief: what is verifiably true today, what is broken or missing, and the order to work in. It does not replace the brief's product mandate — it grounds it.
**Design constitution:** `THREADS-PARITY-STANDARD.md` (added 2026-11-26 after an audit of these instructions found the Threads mandate was described everywhere and enforced nowhere). Read it before touching UI. It outranks this document on all design questions.

---

## 0. P0 — Production and the repo have diverged. Reconcile before anything else.

Verified 2026-11-26 ~2:20 PM CT:

- The repo `jayvierl/BaronPit` has exactly **one branch** (`main`) at commit `4300071f` — Lyris's initial snapshot of the pre-Codex codebase. Nothing has been pushed since.
- Production (baronpit.com) is **ahead of the repo**: three Production deployments landed today (~1:40–2:05 PM CT) from outside the repo, and the live site serves surfaces that exist in **neither** the repo nor Lyris's local tree: `/questions`, `/questions/new`, `/review-hour`, `/playbook`, `/pilot`, `/safety`, `/profile`, a redesigned community objective, a "Find your duo" section referencing `/baron-duo.webp`, and a rebuilt player page (League stats panel, last-20 summary list, "Team secured Baron" chips).
- The Vercel project is git-connected with **Production Branch = main**. Therefore: **the next push to `main` — by anyone — auto-deploys the stale snapshot and rolls production back**, wiping the new surfaces.

**Instructions (do first, in this order):**
1. Push the current production source to the repo from the working checkout that produced today's deploys. That code is the source of truth now; the snapshot is not.
2. Include the binary assets this time: `public/baron-emblem.png`, `public/baron-hero.png`, `public/baron-duo.webp` (and the `docs/art/` masters). A repo-only build currently 404s the favicon, the signed-out hero emblem, and The Baron Pit room banner.
3. From then on, work repo-first: branch → PR → merge to `main`. No more CLI-only production deploys that bypass the repo.
4. Re-check every finding in §3 against the current production source and report which still apply — the code audit was run against the snapshot, and some items may already be fixed in your newer tree.

This audit document itself is delivered on a side branch (`audit/round-3-2026-11-26`) for exactly this reason — it must not be merged to `main` before step 1.

---

## 1. Verified platform state (context Codex can rely on)

- **Live:** https://baronpit.com (apex + www), Vercel project `ward-party`, production branch `main`.
- **Email:** baronpit.com is Verified in Resend; sign-in sends from `Baron Pit <noreply@baronpit.com>`. The old riftfix.com dependency is retired; the RiftFix project, database, and code are deleted. Do not resurrect any of it.
- **Riot key:** a development key rotates daily via a scheduled job (next run today 6:43 PM CT). **Hands off** — do not change the key, the env var, or the rotation. Production App 911877 is still pending; verified Riot linking (RSO) and all monetization/checkout stay **disabled** until it is approved.
- **Data:** Neon DB (tables `wp_*`) is the same one the snapshot code uses — today's deploys did not change databases. `wp_links` still had **0 rows** at last check: no user has completed a Riot link yet, so link-dependent surfaces (spotlight ownership, Hand of Baron, post flair, LFG identity) are dormant, not broken.

## 2. Live-site audit (baronpit.com, 2026-11-26 ~2:20 PM CT)

All routes returned 200 unless noted; server response times measured from Lyris's network (relative baseline, not a lab benchmark):

| Route | Status | Time | Note |
|---|---|---|---|
| `/` | 200 | 1.12s | Slowest main route — see perf note |
| `/player` (Jay Lewis#NA1) | 200 | 0.89s | 92 KB HTML/RSC payload — heaviest page |
| `/rooms`, `/rooms/champ-ashe` | 200 | 0.61s / 0.48s | |
| `/champions`, `/builds`, `/search` | 200 | 0.58–0.77s | |
| `/lfg`, `/signin` | 200 | 0.73s / 0.53s | |
| `/questions`, `/questions/new`, `/review-hour`, `/pilot`, `/safety` | 200 | 0.44–0.72s | New surfaces — not in repo (see §0) |
| `/me`, `/profile`, `/playbook`, `/admin/moderation` | 307 | ~0.45s | Sign-in redirects — expected |
| `/post/1`, `/post/7` | 200 | 0.73s | |
| `/guidelines`, `/terms`, `/privacy` | 200 | 0.51–0.61s | |

Findings:

- **L1 (P1) No Open Graph / social-card meta anywhere.** The home page HTML contains zero `og:` tags. For a social product whose growth loop is shared links (Discord, Threads, iMessage), every shared Baron Pit link renders as a bare URL. Add `og:title/description/image` (the emblem/hero art exists) + Twitter card meta, per-route where it matters (posts, player pages, rooms).
- **L2 (P2) www serves a duplicate instead of redirecting.** `https://www.baronpit.com/` returns 200 with full content rather than a 308 to the apex. Pick the apex as canonical and redirect www → apex (Vercel domain setting), so links, SEO, and cookies consolidate.
- **L3 (P2) Home is the slowest route and the player page is the heaviest payload.** Home at ~1.1s and a 92 KB player document are the two perf outliers against an otherwise 0.45–0.75s site. Profile what home renders server-side (feed + objective + spotlight + trending in one pass) and trim the player page's serialized payload; report before/after numbers, per Jay's brief.
- **L4 (P2) First-run emptiness is the default state.** With zero Riot links in the DB, the feed's social proof rests on the system account and one user post. Verify the new build's empty states as a signed-out first-time visitor: Does the spotlight module render anything honest? Do rooms feel alive (room pulse)? Is there a guided first action (link Riot ID → follow rooms → first post)? This is the "missing something" Jay senses — treat the first session as a designed funnel, not a feed with no content yet.
- **L5 (info) Player page redesign observed.** The "How they compare" reads from the snapshot build are gone, replaced by a League stats panel + last-20 list. Fine as a direction — but confirm the plain-language comparison value (the OP.GG-gap feature) survives somewhere, or record the decision to drop it in the gap analysis.

## 3. Code audit — snapshot tree (re-verify against production source per §0.4)

Severity roll-up: **P0 none in code · P1 ×2 · P2 ×9.** All locations are in the snapshot at `4300071f`.

- **C1 (P1) Magic-link origin check is a suffix match.** `src/app/api/auth/request-link/route.ts:7` — `!origin.endsWith(host)` lets `fakebaronpit.com` pass for `baronpit.com`, and the accepted origin becomes the base URL baked into the emailed sign-in link — a phishing-link minting surface on the real sender. Fix: exact host equality via `new URL(origin).host === host`.
- **C2 (P1) `.gitignore` is two lines** (`.vercel`, `.env*`). It does not exclude `node_modules/`, `.next/`, or `*.tsbuildinfo` — the first `git add -A` from a real clone tries to commit ~8,500 files. Fix: standard Next.js `.gitignore`. (Secrets sweep is clean: no `.env`/key files anywhere in the tree.)
- **C3 (P2) Flair SELECT duplicated ×5** in `src/lib/social.ts` (:294, :304, :317, :341, :354; a 6th full-post query at :674). Compute flair once in TS inside `postViews()` (:238) via `flairFor()` and delete the SQL copies.
- **C4 (P2) Three rank formatters that already disagree** — SQL `initcap` version (no LP), `title()`/`flairFor()` in `social.ts:134-142` (no LP), `rankLabel()` in `src/components/ui.tsx:26-30` (appends LP). One formatter in `src/lib/pure.ts`, used everywhere.
- **C5 (P2) `votePoll` and `reconfirmBuild` fetch the entire post view** (`getPost()` + full `postViews()` pipeline) just to check kind/author/options before a one-row write (`social.ts:365`, :567). Targeted `SELECT kind, author_id, data` instead.
- **C6 (P2) Comments reactions query runs on empty arrays** (`social.ts:381-382`) — wasted round-trip + Neon's empty-array inference edge. Early-return when there are no comment rows.
- **C7 (P2) Blob client is statically imported** into the 640-line client component (`src/components/social-ui.tsx:7`); there are zero dynamic imports in `src/`. Lazy-import `@vercel/blob/client` inside the upload handler.
- **C8 (P2) Cold-start schema DDL is 29 sequential statements** (`src/lib/db.ts` `createSchema()`), memoized per instance and idempotent, but still 29 round-trips on every cold start. Batch via one transaction or move to a deploy-time migration.
- **C9 (P2) Test coverage stops at the library edge.** 17 tests cover `pure.ts`/`moderation.ts` only. `social.ts` (714 lines), `auth.ts`, `riot.ts`, `db.ts`, every API route, and every component are untested — the untested code is exactly where C3–C6 live. Add tests as you consolidate, starting with `social.ts` post-view assembly.
- **C10 (P2) Silent failures.** Zero `console.*` in `src/` — clean of debug noise, but errors are swallowed (e.g. `src/app/builds/page.tsx:16` `.catch(() => [])`). Add a minimal `logError` helper and wire it into route/page catches so production failures are visible in Vercel logs.
- **C11 (P2) Form labelling is inconsistent.** All 25 `<img>` tags have `alt` and landmarks are labelled, but only ~12 `aria-label`/`<label>` pairings exist against 37 buttons and 25 form controls; several controls rely on placeholder alone. One axe-core pass over Composer, LFG, and /me forms.
- Housekeeping: package name in `package.json` is still `"ward-party"`; oldest pins are `vitest ^2.1.0` and `@neondatabase/serverless ^0.10.4`.

## 4. Work order for Codex

1. **§0 reconciliation** — production source into the repo, binaries included, repo-first workflow from now on.
2. **C1 + C2** — the two P1s (one security fix, one repo-safety fix). Small, do them in the reconciliation pass.
3. **Threads parity pass** — per `THREADS-PARITY-STANDARD.md`: fold the drift listed in its §8 back into the Threads grammar (top bar → icon rail, footer → one legal line, home modules quieted, player page profile-first), then run its §7 checklist on every main surface and report the result. Jay's priority order puts cosmetics/feel first — this *is* that work, with the yardstick attached.
4. **L1 + L2** — social-card meta and the www canonical redirect. Cheap, and L1 is growth infrastructure for a social app.
5. **The brief's core work** — Threads teardown, gap analysis doc in-repo, then autonomous build in Jay's priority order: cosmetics/feel → flow (L4 first-session funnel is the named suspect) → performance with measured before/after (L3 is your starting evidence). Every build decision is subject to the parity standard's no-new-surface rule (§5 there): new capability ships as a post kind, composer mode, profile section, or room content — a new top-level destination needs Jay's explicit approval first.
6. **Consolidation backlog** — C3/C4 together (one flair+formatter refactor), then C5–C8 as one perf pass on `social.ts`/`db.ts`.
7. **Tests + observability** — C9/C10 alongside whatever you touch; don't let coverage shrink.

**Guardrails (unchanged, hard):** minimal retention (recent form only, no archive — do not "improve" this away); no hidden-MMR, smurf/bot labels, dodge/shame features, champ-select scouting, or real-time coaching; advice gives reasons, never verdicts; tilt features self-facing only; reactions stay positive-only; moderation stack stays intact; checkout/monetization stays disabled until Riot App 911877 is approved; never commit secrets (env lives in Vercel); the Riot key rotation is a scheduled job — leave it alone.

**Definition of done (per change):** tests pass, typecheck clean, lint 0 errors, production build succeeds, live smoke check on baronpit.com after deploy, and a plain-English summary to Jay: what was missing, what you decided, what shipped, what's left.
