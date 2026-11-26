# Baron Pit — Threads Parity Standard

**Status:** Standing instruction, set by Jay (owner) — re-asserted 2026-11-26. This is the design constitution for Baron Pit. It outranks every other doc's design implications, including the build brief and the 40-features menu. Where another document conflicts with this one, this one wins, and the conflict should be flagged to Jay.
**Companion docs:** `CODEX-AUDIT-ROUND-3-2026-11-26.md` (§0 reconciliation first), `CODEX-DEEP-AUDIT.md`, `BARON-PIT-AUDIT-FOR-CODEX.md`.

## Why this document exists (audit findings, 2026-11-26)

Jay's direction from the start of the redesign: **the site should be similar to Threads** — he rejected the original warm/dashboard look, approved the Threads-emulating redesign as "perfect," and ranks cosmetics first ("the look is what keeps people coming back"), then flow, then performance. Auditing the instruction set against that mandate found:

1. **The mandate was never written as rules.** Across ~50 KB of instruction docs, "Threads" appears only as a description of what the app is — never as invariants, budgets, or acceptance checks. Codex was told to *study* Threads (Jay's brief) but given no yardstick to judge its own output, and nothing that forbids drift.
2. **The docs contradict each other on color.** Round 1 says "restrained Hextech gold/deep-blue accent"; round 2 superseded that with Baron void-violet and never corrected round 1. **Violet is current** (see §3).
3. **Feature pressure is documented; restraint is not.** The build brief (Phases 2–3, Tier 2) and the 40-features menu list dozens of things to add. No doc said new capability must live inside the existing feed/profile/room grammar instead of becoming new surfaces.
4. **Drift is already visible in production** (2026-11-26): the top bar carries ~8 text links (Rooms, Match questions, Bot lane review hour, My playbook, Builds, Champions, Community pilot, Account settings) and the footer 10 links; the home column stacks modules (objective card, duo-invite card, champion-pool chips) ahead of the feed; the player page leads with a stats panel in dashboard layout. Threads has a wordmark, ~5 icons, no footer farm, and the feed *is* the home page. The features are good — their placement is what's drifting.

## 1. The north star

Baron Pit is **Threads, for League of Legends**. Same skeleton, same restraint, same feel — League content, Baron violet accent, League data inside the posts and profiles. When a design decision is uncertain, the question is always: *what does Threads do here?* Match that, then translate.

The approved reference is the Threads-emulation redesign Jay signed off on 2026-11-26 ("I think it's perfect"): monochrome system, single centered column, slim top bar, icon rail / bottom nav, thread-line post cards, Space Grotesk + Inter. Evolve it; do not replace it.

## 2. Layout invariants

- **One centered column**, max-width ~680px, for feed, rooms, profiles, and post pages. No sidebars, no multi-column dashboards, no widget grids — ever.
- **Chrome budget:** one slim top bar (wordmark/emblem + at most a profile/sign-in action), a left **icon** rail on desktop (≥900px) collapsing to a **bottom nav** on mobile. **At most 5 primary destinations**: Home, Rooms (communities), LFG/duo, Search, Profile. Navigation is icons, not text-link lists.
- **No footer link farm.** Legal links (Guidelines/Terms/Privacy) live in one quiet line or inside Settings/Profile — not a 10-link footer.
- Everything else is whitespace and hairline dividers. Threads separates content with lines, not boxes: no cards-within-cards, no colored panels around feed items, no drop-shadow stacks.

## 3. Color and type discipline

- **Monochrome base**: white / true-black dark mode (`prefers-color-scheme`), grays for secondary text. Dark mode is true black, not dark gray-blue.
- **One accent: Baron void-violet** (`--accent` #6d28d9 light / #a78bfa dark) — used sparingly: active states, links/CTAs, the win tint, brand moments. **Gold survives only in rank flair.** No new accent colors, no gradients on chrome (room banner art is content, chrome is not). This supersedes the "Hextech gold accent" line in `CODEX-DEEP-AUDIT.md`.
- **Type**: Space Grotesk for display, Inter for body — already loaded. Hierarchy comes from size/weight/space, never from color blocks or badges shouting.

## 4. Feed grammar (the product's core loop)

- Home opens on the feed: **For you / Following tabs**, then the composer, then posts. Modules (objective, spotlight, invites) may exist but must be visually quieter than the feed and never push the first post below the fold on mobile.
- **Composer**: a single "Start a thread…"-style line that expands in place. Post kinds (text, build, poll, clip, media, game card, Baron call) are modes *inside* the composer, not separate pages or buttons elsewhere.
- **Post cards**: avatar + name (+ flair) + time; body; media/build/poll inline; one action row (react, reply, repost/share-style actions) with counts; thread-line connector into replies. Positive-only reactions stay.
- **Profiles** lead with identity — avatar, name, bio line, follower counts — then the person's posts (Threads grammar: Posts / Replies / Reposts-style tabs). Stats are a *section within* the profile, not a dashboard the profile is built around. The `/player` lookup keeps its clean OP.GG answer (last 3 games, duo, plain-language reads) but composed in this same grammar.

## 5. The no-new-surface rule

New capability ships as one of: **a post kind, a composer mode, a profile section, a room, or room content** — not a new top-level destination, nav item, or standalone page. Questions, review hours, playbooks, pilots, and similar programs are *content programs*: they live as rooms, recurring threads, or post kinds.

A genuinely new top-level destination is the rare exception and requires **Jay's explicit approval first** — propose it in one paragraph (what it is, why it can't live in the existing grammar, what it costs the chrome budget) and wait.

Corollary for the backlog docs: the build brief's Phase 2/3 items (dedicated Clips surface, algorithmic discovery feed, user-created clans) and every item in the 40-features menu are **gated on this rule** — implement inside the grammar, or get Jay's exception.

## 6. Motion, feel, and empty states

- Micro-interactions are the product's texture: optimistic reactions/votes/follows (already partly in), subtle press states, no layout jank, skeleton-free instant-feeling loads. Performance work (round-3 §L3) serves this — a Threads-like app that stutters is not Threads-like.
- **Empty states are one line of honest text + one clear action** (Threads style), not illustrated panels or multi-card onboarding stacks. The first-session funnel (round-3 L4) is designed *inside* the feed: link Riot ID → auto-join rooms → first post, as quiet prompts in the column, dismissible, never a wizard.

## 7. Pre-ship parity checklist (run for every UI change)

1. Screenshot the changed surface next to the same surface in Threads. Same skeleton? Same whitespace rhythm?
2. Did chrome grow — any new nav item, text link, footer link, or top-bar element? If yes: stop, apply §5.
3. Did the home column gain a module louder than a post? Rebalance or remove.
4. Any new color, gradient, shadow, or panel on chrome? Remove it; accent is violet, chrome is monochrome.
5. Does the first post still appear above the fold on a phone-sized viewport?
6. Dark mode still true black, and does the change hold in both modes?
7. Would a Threads user find every control where their thumb expects it?

Report the checklist result in the change summary to Jay, one line: "Parity check: pass" or what was traded and why.

## 8. Current drift to fold back (from the 2026-11-26 production build)

Keep the features; fix their placement, inside the reconciliation work:

- **Top bar**: fold the ~8 text links back to the icon rail + a single overflow/Settings entry. Questions, Review Hour, Playbook, Pilot become rooms or recurring threads (§5).
- **Footer**: reduce to the single quiet legal line.
- **Home column**: objective and duo-invite become quiet one-line strips in Threads grammar; champion-pool chips move into Rooms/Search where discovery belongs.
- **Player page**: keep the data (rank, last-20, Baron chips), recompose the top of the page as profile-first (§4) instead of a stats panel with a page wrapped around it.

None of this removes capability. It puts the capability back inside the design Jay approved — which is the whole point: **the look is what keeps people coming back.**
