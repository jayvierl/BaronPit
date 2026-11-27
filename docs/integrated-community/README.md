# One conversation around a game

Start in the home search. Look up a player to discuss a particular game, or search for a champion or item to discuss a build. Each route leads into the same feed, room, profile and conversation system. The original game or build remains reachable from the discussion.

## Try these paths

| Starting point | Player action | What the next player sees |
| --- | --- | --- |
| Home or Search | Search for a champion. Open its hub and move between Overview, Discussions and Builds. | Champion class, observed role and W/L from the labeled local sample, then relevant conversations from eligible authors. Filters and the original search survive the return trip. |
| An item or a champion’s Builds tab | Start a build. Choose a champion, an ordered set of one to six items and an optional keystone. Explain the decision and choose whether to mark it off-meta. | A discussion with a server-confirmed patch, links to items and alternatives, and the author’s reasoning. Other people can find a global build through its champion. |
| Player match history | Expand a game. Open the objective timeline to check a decision. Select Discuss this match, preview the public context, then publish. | A stable discussion link with match evidence and a link back to the selected game. Opening game history, a timeline or a draft alone creates zero posts. |
| A conversation | Reply, follow, save, repost, or quote an eligible post with your own reasoning. The author can close and reopen replies from the overflow menu. | New replies can reach the author through Activity. A quote checks its original at each read. Closing replies preserves existing discussion. Saves and progress are personal. |
| A social profile or personal Playbook | Browse the author’s match discussions. In My progress, revisit a helpful reply and record the outcome after trying it. | The public profile credits the author. A game mentioned in their writing can belong to another player. The progress list is private. An outcome explicitly published in its original conversation remains visible there. |

## How the reference products informed the work

OP.GG’s named-player lookup, in-place match expansion and structured champion/item evidence informed the entry points. Threads’ reply permalinks, quoting, topic navigation, Following feed and return notifications informed the way a conversation continues. These work through Baron Pit’s own database, identity, moderation and interface. A social account works without linking a Riot account. The side-by-side source log distinguishes personally observed public interactions from vendor documentation. [Reference observations](../match-discussion/references.md) · [Following and Discover behavior](../match-discussion/feed.md)

A champion hub samples up to 20 public games each from up to 300 recently refreshed profiles. Its denominator is player appearances on that champion, and two players may appear in the same match. Mixed queues or patches carry an explicit label. The build catalog describes purchasable items and keystones for the recorded patch. The author explains when a combination might help. Neither likes nor rank supply statistical evidence for a build. A patch refresh that cannot validate the catalog leaves a build unconfirmed. [Champion hub](../../src/app/rooms/%5Bslug%5D/champion-room.tsx) · [Build confirmation](../../src/lib/build-sharing.ts)

## Data, access and cost

- A viewed Riot ID and a verified account link remain separate identities. Community search uses the public Riot ID and platform. Visibility checks also apply to suggested players and recent champion samples.
- Match cards reuse server-validated recent game evidence. Objective timelines recheck the viewer’s access to the source before using cached facts. One explicit open can request one completed Match-v5 timeline. The server keeps only supported monster/structure times and available team colors in a bounded ten-minute memory cache. The feed, composer and ordinary match history issue zero timeline requests. Current ceilings are four in-flight timelines per instance and eight uncached upstream requests per minute across instances. Rate limits, missing timelines and outages have distinct user states. No extra subscription or background importer is needed.
- A quote stores the new author’s words and a pointer to the original post. A block, mute, moderation hold or withdrawal changes which text the viewer can see. If the original is withdrawn, the other author's eligible commentary survives without an excerpt. Closed replies are enforced in the same database operation that inserts a comment, including nested replies and One Fix. Protection, reporting, withdrawal and existing reply visibility remain available.
- Costs follow normal feed and hub SQL reads, static asset delivery, and the explicitly opened timelines. Pilot staffing, actual Neon transfer, awarded Riot limits and third-party access must be checked against provider records before broad rollout. The capacity harness and operator gates are reproducible. [Provider and capacity evidence](../match-discussion/capacity.md) · [Safety procedures](../../COMMUNITY-SAFETY.md)

## Measured feed cost

Enabling native quotes changed the database planner’s estimate for the newest reply on each post. At 10,000 posts and 30,000 replies, the first Discover page initially discarded 35.3 million candidate row pairs while looking up eligible activity. Grouping by the stored comment’s indexed post identifier preserves the same eligible reply and ordering, and lets PostgreSQL use its column statistics.

| Optimized server reader | Before correction, median | After correction, median | After correction, P95 |
| --- | ---: | ---: | ---: |
| Discover, first 30 posts | 2,466 ms | 121 ms | 630 ms |
| Following, first 30 posts | 30 ms | 28 ms | 431 ms |
| Match attachment preview | 2 ms | 1 ms | 1 ms |

These are ten warm samples on shared local hardware and an in-memory PostgreSQL fixture. They time application database readers. End-user latency on Neon and Vercel includes different network, compute and rendering costs. The fixture returned the same 30-post page shape using four queries, had zero duplicate post IDs across pages, and made zero outbound vendor calls. To inspect the query plan, run `CAPACITY_PLAN=feed npx vitest run --config scripts/capacity/vitest.config.ts`. [Harness and data distribution](../match-discussion/capacity.md)

## Review and rollout

1. Reproduce the optimized app with the local isolated PostgreSQL fixture. Run type checking, Vitest, lint, the production build, built-app HTTP smoke and the browser walkthrough. The reference player, email sessions and published content in the walkthrough are synthetic. [Walkthrough and screenshots](demo.md) · [CHECKER findings](review.md) · [CHALLENGER findings](challenger.md)
2. Verify the reviewed branch SHA and compare it with the current production artifact. Preview integration uses a separate, authorized preview database. Provider email delivery, production RSO approval and real key coverage require separate operator evidence. Keep testing social writes in disposable data.
3. On owner approval only, release the reviewed commit to the existing Vercel project. Its schema bootstrap advances generation 3 to 4 in the existing transaction, adding the quote pointer table and indexes and the default-open reply setting. Existing posts retain their prior reply behavior. The change requires no gameplay backfill. Smoke-check public routes and assets and monitor DB errors, feed latency, moderation and Riot 429s. [Bootstrap](../../src/lib/db.ts)
4. If there is a regression, pause participation with the existing safety control and restore a reviewed build that retains the consent, visibility and closed-reply checks. An older binary would accept new replies on closed discussions. Keep the additive schema and user content during recovery, then rerun the private fixture checks before lifting the pause.

Review the pilot using independently answered match or build questions, time to first response, and authors who return to record an outcome. First-party analytics exclude test accounts. Population-wide champion tiers, causal coaching scores, native mobile clients and real-money tipping have separate data, platform or approval requirements.
