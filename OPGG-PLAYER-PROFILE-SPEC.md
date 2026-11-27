# OP.GG-style player search & profile — build spec (2026-11-26, Lyris for Codex)

**Jay's ask:** now that the social side is built, add a player search "very similar to OP.GG," referencing his screen recording of the OP.GG mobile profile for Jay Lewis #NA1. This is an expansion of the existing `/player` surface — per THREADS-PARITY-STANDARD.md it is **not** a new destination. Search entry points: the player form on `/player`, `/search`, and the home search box route `Name#TAG` (+ region) straight to the profile.

## What the reference video shows (in scroll order)

Identity header (icon + level, name#tag, ladder rank) → Update button + Tier graph + "last updated" → tabs (Summary / Style / Champions / Highlights / Mastery) → Ranked Solo/Duo card (tier, LP, W–L, WR%) → past-season tiers table → Flex / 5s cards → Play style (role share %, preferred classes %) → activity time grid (AM/PM) → most-played champions (season scope: games, CS, KDA line, WR%) → Performance block (recent 20 vs season: WR, KDA, kill participation, game length, with ± deltas) → ranked W/L past 7 days per champion → activity patterns (day-of-week bars, hourly bars with WR) → champion mastery (points + level) → recent games list (per game: result + duration, queue + age, champion + level, spells/runes, K/D/A + ratio, laning score, P/Kill %, CS/min, opponent rank, item build, both team strips, expandable).

## Current state (verified live 2026-11-26 ~6:45 PM CT)

`/player` already has: search-another-player box, identity header (level, Baron-secured line, earned flair), Recent form tiles, a League stats panel (Solo/Duo tier · LP, ranked games, WR%, W–L — league-v4), a last-20 summary (most-played role/champions) and the last-20 match list with community prompts. Snapshot = last 20 matches (`src/lib/riot.ts`: account-v1 → summoner-v4 + league-v4 + match-v5 ids `count=20`); refreshes reuse the player's previous snapshot so only missing match details are fetched. A `force` search param already exists. Fallback to last-known records works (it carried the profile through tonight's key-expiry window).

## Feature map

| OP.GG element | Status | Data source | Phase |
|---|---|---|---|
| Update button + "last updated …" | Build — surface the existing `force` param + snapshot timestamp | existing | A |
| Flex rank card (alongside Solo/Duo) | Build — league-v4 already returns all queues in the same call; render the Flex entry too | league-v4 (in hand) | A |
| Champion mastery panel (top ~8: points, level) | Build — one extra call, high OP.GG feel | champion-mastery-v4 by-puuid | A |
| Role share % (last 20) | Build — aggregate `teamPosition` over the snapshot | snapshot (in hand) | A |
| Preferred classes % | Build — champion class tags from Data Dragon (static, already vendored for portraits) × games played | Data Dragon + snapshot | A |
| Past-7-days W/L per champion (bars) | Build — from snapshot timestamps | snapshot (in hand) | A |
| Richer game rows: items, spells, runes, both team strips, P/Kill %, CS/min | Build — all present in the match details already fetched; display work only | match-v5 detail (in hand) | A |
| Deepen snapshot 20 → 100 matches | Build — raise the ids count; the snapshot-reuse mechanism means steady-state refresh cost stays ~the new games only. First deep pull ≈ 80 extra calls: batch + back off (dev key: 100 req / 2 min) and degrade gracefully to 20 if throttled | match-v5 | B |
| Most-played / role share / classes at "last 100 games" scope | Re-scope the Phase A aggregates; **label the scope honestly** ("Last 100 games") — never "season" | snapshot-100 | B |
| Performance deltas (recent 20 vs previous 80: WR, KDA, KP, game length) | Build on snapshot-100 | snapshot-100 | B |
| Activity patterns (day-of-week bars; hourly bars + WR; AM/PM grid) | Build on snapshot-100 timestamps | snapshot-100 | B |
| Past-season tiers table | **Not available from the Riot API** (current entries only). Answer = Phase C archive, framed honestly: history starts accumulating from first lookup | — | C |
| Tier / LP graph | Needs stored rank snapshots over time — same archive table as past seasons | new `wp_rank_history` | C |
| Laning score (e.g. 39:61) | **Skip.** OP.GG's is proprietary (timeline-derived). Optional later: end-game gold/CS diff vs lane opponent, labelled plainly as such — never call it a laning score | match-v5 detail | — |
| Ladder rank ("1,073,460 · 63.62% of top") | **Skip for now** — needs the full ladder (league-exp / challenger→iron crawl), out of scope on a dev key | — | — |

## Phase C — the archive (how Baron Pit earns OP.GG's moat honestly)

On each profile refresh, append `{puuid, queue, tier, division, lp, wins, losses, captured_at}` to `wp_rank_history` (dedupe: one row per player/queue/day). At a season rollover, the "past seasons" table renders from the last snapshot of each prior season; the tier graph renders LP over time once ≥2 points exist. Copy rule everywhere: no history is shown that we did not actually record. This is deliberately small — it is a retention *exception* to the minimal-retention design and stores rank data only, no match detail beyond the existing snapshot.

## Design rules (parity standard applies)

Single 680px column; sections are stacked panels in the current League-stats card language; Baron violet is the only accent (victory/defeat tints as established). A profile-local tab row (Summary / Champions / Mastery) is acceptable — it mirrors both OP.GG and Threads profile tabs — but all content stays on `/player`. Aggregates always carry their scope label ("Last 20 games" / "Last 100 games"). No verdicts, no shaming stats, nothing about other named players beyond what a match's public record shows (existing policy walls unchanged).

## Acceptance checks

1. `/player?riotId=Jay Lewis#NA1` shows: Update button + last-updated stamp; Solo/Duo **and** Flex cards; mastery panel with real points (Renata Glasc ≈ 272k); role share + preferred classes; past-7-days champion W/L bars; game rows with items/spells/runes/team strips.
2. After Phase B: aggregates labelled "Last 100 games"; performance deltas visible; activity patterns render; a throttled first deep pull still returns a complete last-20 profile (no hard failure).
3. No regression: snapshot reuse still avoids refetching known matches; sign-in, rooms, feed untouched; `scripts/public-art.mjs` + existing tests pass.
4. Phase C: two refreshes on different days produce two `wp_rank_history` rows; nothing labelled as a past season until a rollover has actually been recorded.
