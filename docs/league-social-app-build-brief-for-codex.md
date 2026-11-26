# Build Brief — League of Legends Social App

**For:** Codex (initial build)
**From:** Jay Lewis (owner) via Lyris / Muse (research & product)
**Date:** 2026-11-25
**Status:** Research complete. Build Phase 1 (below) from this brief.
**Working title:** TBD — the current name "RiftFix" is being dropped (see Naming).

---

## 1. The product in one paragraph

A League of Legends **social app** with a fast player-stats lookup as its traffic engine. Players search any summoner and instantly see recent form — last ~20 games, wins/losses, rank, champion stats — competitive with OP.GG on speed and clarity. Layered on top is the actual product: a text-first social platform where players follow each other, post takes and clips, share builds (including off-meta builds), gather in champion and meta rooms, and find verified duo partners. Social is the retention layer and the competitive edge; stats are the acquisition layer and every profile's trust/identity layer.

## 2. The pivot — read this first

The previous product ("RiftFix") was positioned around a **"Forever archive"** of match history. **That position is cancelled, completely:**

- Do NOT build long-term match/gameplay archiving. League is season-to-season; months-old gameplay is irrelevant to players, and storing it is expensive and unrealistic at scale.
- Keep only **recent-form data**: recent matches (last ~20), current rank, current-season stats. Fetch from the Riot API on demand; cache briefly; do not accumulate a permanent archive.
- Features from the old product worth keeping conceptually: fast player search, recent stats / wins-losses views, champion / item / build data pages, duo finder. Everything else is subordinate to the social rebuild.
- This decision also kills the old product's database cost problem (its free-tier database died from archive-driven data transfer). Minimal retention is a design requirement, not a preference.

## 3. Format decision (researched — do not relitigate without new evidence)

**Text-first at launch, architected as a phased hybrid. NOT video-first.**

Why, in brief:
- **Supply:** ~48% of TikTok users have never posted a video; the top 25% of posters produce 98% of public videos. Clips additionally require PC capture tooling pre-installed. Text has near-zero creation friction, and League's proven culture is text discussion (r/leagueoflegends ~8.5M members, ~134 posts/day).
- **Habit:** Text alone has no daily job (Threads: 400M MAU but ~5 min/day). This app's daily job is the stats check — that is what brings users back daily, and social rides on it.
- **Feed rule:** Never let watch-time ranking control the main feed. When it does, video eats discussion (Instagram precedent). Clips live **inside** the text feed as a post type (the X model).

### Phasing
- **Phase 1 (this build):** Stats lookup + global text feed + rooms + profiles + clips as an in-feed post type (upload + playback, no dedicated clips surface) + build sharing + verified duo/LFG + polls + moderation stack.
- **Phase 2 (only after a pre-set clip-supply threshold is met in Phase 1):** Dedicated scrollable Clips tab/surface.
- **Phase 3 (later):** Capture tooling integrations, algorithmic discovery feed, open user-created clans/communities.

### Signature feature — daily rotating profile highlight
Each profile has a highlight slot that rotates daily. It must be **passive/automatic**: auto-built from the player's recent games. On days with no clip, it shows a generated stat card — the slot is never empty and never a posting chore or streak mechanic (BeReal-style obligations collapse; Duolingo-style effortless loops work).

## 4. Feature blueprint

### Tier 1 — launch (Phase 1 scope)
1. **Player search & profiles** — search by Riot ID; profile shows rank, recent-20 form (W/L, KDA, champion pool), and social identity. Profiles linkable to a user's own Riot account (RSO — see constraints).
2. **Follow system + global home feed** — home screen = search + feed of followed players and community posts. Text posts, image posts, clip posts, build posts, polls.
3. **Rooms** — a FEW broad rooms at launch (e.g., General, Patch/Meta discussion, LFG). Champion rooms for 10–20 popular champions, **pre-filled with live stats content so no room is ever empty**, and users are **auto-joined to their top-3 champions' rooms** based on their match data. Do NOT launch hundreds of empty rooms (most subreddits are dead; empty rooms kill cold start).
4. **Build sharing** — post a build (champion, runes, items, brief rationale), **stamped with the current patch**, author identity shows their rank/verified stats on that champion. Upvotes. An "off-meta" tag/category is a first-class citizen — off-meta builds are a headline use case.
5. **Verified duo / LFG** — the sharpest unmet need in the market (Riot never shipped a partner finder; Discord/Reddit LFG has no rank verification). Listings pull **real rank and recent form from the API** (no self-reported rank), with fit fields: roles, champion pool, play times, voice/no-voice, chill vs. tryhard.
6. **Post-game share cards** — auto-generated, good-looking stat cards from a recent match, one tap to post to the feed.
7. **Polls** — native, quick (meta debates, tier votes, matchup calls).
8. **Moderation stack (day one, non-negotiable)** — reporting, blocking, rate limits, automated text filtering, human review queue. League community toxicity is documented and severe; a social app without this fails or becomes a liability.

### Tier 2 — fast follows (after launch traction)
- Duo endorsements / persistent reputation ("good teammate" signals that carry across sessions — the memory Discord LFG lacks).
- Clash team finder.
- Friends leaderboards and group challenges.
- Off-meta build spotlight (editorial/algorithmic featuring).
- Esports watch-along threads and pick'ems.
- DMs (gated — after trust/reputation systems exist).

### Tier 3 — later
- Algorithmic "For You" discovery feed.
- Open user-created clans (the true successor to Riot's removed Clubs — players mourned the identity/tags, not the chat).
- Desktop companion app.

## 5. Competitive context (why this wins)

- **OP.GG** (~55M monthly visitors, self-reported) is the only stats site with any social layer; its Talk/Duo boards are spam-ridden (clan spam pushing users to Discord, most posts 0–1 comments). U.GG, Mobalytics, Blitz, Porofessor, Lolalytics, LeagueOfGraphs: **no social graph at all** — no following, no feed, no profiles-as-identity.
- **MOBAFire's** user-build model is decaying (guides get <4 votes/month; outdated builds stay ranked).
- **Riot vacated community**: official Boards closed Mar 2020; Clubs sunset Dec 2020. No incumbent has rebuilt that layer.
- Positioning: **stats = identity and trust layer; social = the product.** Survivors in gaming social (Medal, FACEIT) started as a tool and layered social on top — this plan follows that pattern deliberately.

## 6. Riot constraints (hard requirements)

- **API-only architecture.** Riot blocked third-party memory access in Oct 2026; approved apps have a grace period to Apr 2027. Do not design anything that depends on reading game-client memory.
- **Production API key required** for real launch (owner's application, App ID 911877, is pending with Riot). Build against the dev-key limits; design for production limits (reported: 500 req/10s, 30k req/10min — verify against current Riot docs).
- **RSO (Riot Sign-On)** is the only sanctioned way to verify account ownership for linked profiles — gated on production approval. Until then, profiles are lookup-based; clearly separate "verified owner" from "viewed profile" in the data model so RSO can slot in.
- **Prohibited:** MMR calculators, identifying hidden/pre-game champ-select players, gambling features. A free tier of the product is required by Riot policy.
- **Naming/legal:** Riot's "Legal Jibber Jabber" — no Riot logos/trademarks, no domains or handles using Riot trademarks or champion names, and a non-endorsement disclaimer ("not endorsed by Riot Games…") is required on the site.

## 7. Naming

"RiftFix" is dropped. New name is **not yet chosen** — build with the name as a single config/branding variable everywhere (no hard-coded product name in code, copy, or assets).

Research shortlist leads:
- **Ward Party** — lead candidate, no visible incumbent.
- **Baron Pit** — co-lead, no visible incumbent.
- Backups: Lane Mates, Pentaparty, Brush Party.
- **Avoid:** Rift-led names (an established LFG network "RiftQ" exists; Rift reads as a repair tool), "GG" names (read as stats sites), Nexus (Nexus Mods), QueueUp / DuoQueue / LOBBY (existing products).

## 8. Data & cost principles

- Minimal retention by design: recent matches and social content only; no gameplay archive, no replay hoarding.
- Video is a post type, not the platform: use a managed video pipeline (e.g., Cloudflare Stream or Mux — published pricing ≈ $5/1,000 min stored + $1/1,000 delivered, or Mux ≈ $0.0024–0.003/min stored) rather than self-hosting. Raw infra at seed scale is hundreds/month; the true costs are moderation and engineering surface — keep both small in Phase 1.
- Every room/feed surface must render useful content for a brand-new user with zero follows (stats-driven content fills the cold start).

## 9. Roles & process

- **Codex:** builds Phase 1 from this brief.
- **Lyris (Muse):** owns research and product; will step in after the initial build to add additional assets and features.
- **Jay (owner):** final calls on name, spend, and launch.
- Flag conflicts with this brief rather than silently deviating — especially anything that reintroduces long-term data archiving or a video-first home surface.

## 10. Open items (not blockers for starting Phase 1)

- Final name selection (owner) → then domain + trademark check.
- Riot production key approval (App 911877) → gates RSO verified linking and launch scale.
- Clip-supply threshold number for the Phase 2 gate (set from Phase 1 posting data).

---

*Full research behind this brief (two deep-dive reports with sources, available from Lyris): (1) LoL community social needs, competitor social audit, mechanics comparison, naming research; (2) text vs. video vs. hybrid format decision — creation economics, retention evidence, rooms vs. feeds, cost reality check.*
