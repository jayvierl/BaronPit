# Baron Pit and Threads

Product and engineering review, 26 November 2026. The comparison is between the public Threads web product and Baron Pit’s social experience for League players. The first production baseline was deployment `dpl_J4uPrvRdYSfmtaFia1zNyVratjnH`. The controlled local baseline was commit `02ce63c`, which already included the profile editor and ranked-profile changes.

## What was missing

Baron Pit already had useful conversations, rooms and a direct path to a duo. On a small phone, the first post began 350 pixels down the page. A returning visitor saw an empty writing form before they saw anyone worth talking to. The profile of a real player advertised missing endorsements, while a room’s Post command could take them out of the room. The pass prioritizes seeing a person, understanding their post and responding without losing your place.

## What we observed on Threads

| Surface | Evidence | What translates to Baron Pit |
| --- | --- | --- |
| Home | The public web page first painted a fixed icon rail, a column heading and rows of loading placeholders. The populated page had a continuous white sheet, fine separators, avatar, author, short time, post body and action counts. A topic appeared inline with one post. Media sat underneath its author’s words. | Give conversation the first screen. Keep room attribution next to the author. Move secondary tools outside the body of the post. |
| Discussion | A public thread showed Back, a single column heading, author and verification mark, time, Edited, More, and adjacent like, reply, repost and share actions. Replies occupied the same reading column. | Keep children visually connected to the conversation, give every action an accessible name, and let the reader get back to the room or search that brought them there. |
| Profile | A public profile displayed a large name, handle, portrait, bio, link, follower count, Follow and Mention, then Threads, Replies, Media and Reposts. A first batch of posts was readable while signed out. | Give a League player’s bio and picture precedence. Put the follow action next to identity, and show earned evidence where it exists. A verified Riot link means actual ownership verification. |
| Entry and limits | The public home showed a side sign-in panel and then a modal inviting Instagram sign-in. Public profiles had a finite signed-out history. The authenticated composer, in-session follow/like animation, personalized feed, native pull-to-refresh and private activity were outside this live sample. | Keep read-only discussion open. Require sign-in for a write. The public web inspection provides no basis for claiming exact gesture timing, signed-in ranking behavior or a measured retention lift. |

Directly inspected [Threads home](https://www.threads.com/), [public discussion](https://www.threads.com/@hereticcoffeepdx/post/DgLkb_7COmI) and [public profile](https://www.threads.com/@hereticcoffeepdx).

Meta describes a single-column web view, a mobile-consistent feed order, and a floating web composer. It documents chronological Following, optional reply controls and room discovery through a tag on a post. Bluesky’s optional collections of recommended feeds and people are a useful model for first-session discovery. These are first-party descriptions. The signed-in animations were not timed. [Threads web](https://about.fb.com/news/2025/04/new-features-threads-web-experience/) · [Feed audiences](https://about.fb.com/news/2023/07/introducing-threads-new-app-text-sharing/) · [Reply controls](https://about.fb.com/news/2025/03/new-threads-features-more-personalized-experience-you-control/) · [Communities](https://about.fb.com/news/2025/10/introducing-threads-communities-find-your-people/) · [Bluesky starter packs](https://bsky.social/about/blog/06-26-2024-starter-packs).

## Screen-by-screen gaps and calls

| Screen or detail | Impact | Finding and decision |
| --- | --- | --- |
| First visit to Home | Look, flow | The empty guest textarea competed with the first real author. Open it from a compact invitation and open it automatically when someone chooses Post. Preserve the guest’s explicit sign-in draft. |
| Home feed and Duos | Look, flow | The old duo panel interrupted the first two conversations. Give Duos a direct link at the top, keep the first three posts together when available, then introduce the duo plan with a small crop of the existing Baron artwork. Empty feeds retain destinations. |
| Feed identity | Look, trust | Room attribution occupied a second line. Set the room beside the byline, put writing before attachments, and keep verified rank distinct from the author’s identity. Keep automated patch updates identified. |
| Actions and motion | Look, accessibility | Skinny controls were harder to hit than they looked. Use a consistent 44px-wide interaction area for main post actions and subtle press feedback that respects reduced motion. Written and pressed-state labels remain available to assistive technology. |
| Feed choices | Flow | Everyone and Following describe the actual data. Keep those names, chronological intent and guest return URLs. A new sign-in target must retain the selected feed. An algorithmic For You label would promise a recommendation model the site does not have. |
| Thread detail and Back | Flow | A hardcoded Home link lost a room, search or filter. Restore the previous validated app history entry when the browser exposes it. Give direct and external arrivals a safe feed fallback. Browser Back is also available. |
| Replies and loading | Look, speed | A footer could paint before the replies and move as they arrived. Render the normal reader-filtered initial replies on short threads and keep inline disclosure lazy on Home. Long discussions use the existing bounded route. Use shape-matched placeholders and keep stable space beneath a conversation. |
| Composer and receipt | Flow, trust | Sign-in recovery protected some drafts, but ordinary navigation could lose a signed-in draft. Keep the draft in the current tab for 30 minutes, scoped to account and room, with explicit discard. Preserve retries. Offer Open thread only for a server-confirmed visible post. Held submissions lead to private receipts. |
| Formats and attachments | Flow, safety | Plain text is the normal starting point. Keep optional polls, builds and approved-host clip links in the same flow. A click opens approved external video on its host. Full-bleed video, native upload and external media zoom remain gated by the existing review architecture. |
| Public profile | Look, flow | On a new profile, three zero endorsements and missing-link copy spoke louder than the player. Lead with name, portrait, bio, follower counts and action. Show endorsements with positive evidence; retain reporting, blocking and access to endorsement actions. Give empty Posts an action appropriate to its viewer. |
| Ranked identity and stats | Trust, speed | Keep rank and season counts from the eligible Riot snapshot, label unverified links and distinguish the recent 20-game sample from the ranked year. Account settings and the picture picker now retrieve identity fields without match histories. The Linked Players tab skips an unused post feed. |
| Navigation | Flow | Activity was behind Explore and Post could jump from a room to the global feed. Put Activity and Duos in persistent navigation, keep Profile in the header, and target the current room/feed when composing. Indicate pending navigation without blocking input. |
| Search | Flow, speed | A second lookup form pushed people and discussions below the fold. Lead with community results, disclose Riot lookup where useful, and supply a recovery path when a search is empty. |
| Activity and saved work | Flow | A generic sign-in or empty private page lost intent. Carry activity filters through sign-in, retain pagination and offer a destination from empty Replies, Watching or Invitations. No fabricated unread counts or notification pushes. |
| Signup and first session | Flow | Default sign-in did little to explain where the player would land. Use short context-specific copy. For eligible new accounts opening account settings, give direct paths to the general room composer and private duo plan. A member arriving from a room, thread or draft still returns there. |
| Match questions | Flow | Authors selected a topic but readers could not browse it. Make the five existing topics filterable and link the topic from each question, including its detail page. Keep role, sort and visibility filters in effect. |
| Rooms | Look, flow | A directory of empty host labels made active rooms feel unattended. Show a host when one consents to be identified. Keep room labels as direct entry points and retain human/moderation attribution. |
| Duo Finder | Look, trust | A status notice could overwhelm the actual job. Give private preferences a compact introduction and League artwork. Keep the pilot and verification status explicit, without populating the board with simulated partners. |
| Cold start and return visits | Trust, flow | Joining an empty room or activity view should lead to a real next action. Use introductions and current match questions. A starter pack needs consenting, active people; revisit it when there is enough supply. |
| Dark mode, touch and movement | Look, accessibility | Keep Space Grotesk/Inter and monochrome reading surfaces. Violet marks purposeful actions and League artwork carries color. Verify real viewports in both color schemes. Retain native scrolling, keyboard activation, focus rings and reduced motion. A custom pull gesture adds interference on mobile web. |
| Thumbnails and delivery | Look, speed | One small portrait could fetch a 158 KB directory sprite. Use separately cacheable, patch-versioned WebP tiles on sparse surfaces and keep the sprite for directories. The duo rail uses a 2,650-byte local asset. |
| Outside the social loop | Deliberate | Champion/build references, safety inbox, staff review, reports, block/mute, sign-in consent and payment restrictions retain their purpose. No change to Riot approval, moderation thresholds, positive-only reactions, game retention or media screening. Profile Replies/Media feeds and additional audience controls need useful supply and viewer-filtered query designs before launch. |

## Engineering backlog reconciliation

- **C1, C4 and D6.** `post-reader.ts` centralizes reads and enrichment. `player-summary.ts` formats verified rank and champion flair. Poll votes and build reconfirmation use targeted checks. Existing fixtures cover legacy and missing values.
- **C2, D8, S1 and S2.** `client.ts` owns the JSON mutation helper. The general media uploader is paused and the feed does not import a Blob client. `auth-http.ts` validates same-origin writes exactly. Empty comment results skip the reaction read.
- **The six Baron review asks.** The rally clock has a bounded up window and cleanup. Daily objectives use bounded UTC reads and viewer visibility. The spotlight is persisted by day and rechecks eligibility. Legacy snapshots can omit Baron data. The poll banner only renders a validated call poll. There is one social flair formatter. None required restoring duplicated SQL or loosening account ownership.
- **Measurement.** The mobile home lab budget for this pass is LCP ≤2.5 s, TBT ≤200 ms, CLS ≤0.10 and ≤360 KiB transferred on the seeded home. The comparison uses Lighthouse 13.6 with mobile simulated throttling, independent cold browser profiles and the same fixture. TBT measures blocked main-thread time during load. It is not field INP. Fresh-connection and reused-connection HTTP TTFB capture the first HTML byte; neither demonstrates a cold Vercel function.
- **Interim defect caught by testing.** The first polished build sent 486–491 KiB instead of about 377 KiB. One of three runs shifted the home feed by 0.106. Keep conversation rows stable before lower modules stream and use small individual portraits. Report the corrected run separately from production, where deployed content can differ.

## Controlled acceptance results

| Same seeded content, mobile | Before | Polished build |
| --- | ---: | ---: |
| First conversation, both 320px and 390px viewports | 350px below viewport top | 223px |
| First in-page Duo Finder entry | 630–631px | 73px |
| Main post action targets | 32 × 44px | 44 × 44px |
| Home transfer, Lighthouse median of three | 379 KiB | 333 KiB |
| Home LCP, median | 0.91 s | 0.91 s |
| Home CLS, three runs | 0 each | 0 each |
| Seeded discussion CLS, three runs | 0.137 each | 0 each |
| Seeded discussion TBT, median | 257 ms | 62 ms |

In the first controlled batches, home TBT varied more than LCP. Its median increased from 45 ms to 261 ms during concurrent work, above the 200 ms target. Use paired runs and field data before attributing a main-thread improvement. The last byline spacing refinement was checked in the final build and the public comparison. No field INP, field retention or delivery-time guarantee follows from these lab runs.

An isolated browser test took a new user from a local welcome email through consent into the general room and a first post. The private receipt appeared and the held post stayed off the signed-out profile. Other browser checks covered account/room draft separation, a retried post with one server ID, cross-tab sign-out, room Back, and keyboard Post focus. The first-session path after verification takes one navigation to get to a composer. Real email delivery and the time a person takes to introduce themselves were not measured.
