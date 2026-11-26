# Four-week bot lane pilot

Jay owns the expansion decision. Assign a facilitation owner and two designated safety responders before recruiting. No invitations have been sent, no price has been set and enrollment grants no verified Riot or Duo Finder privileges.

## Recruitment

Recruit 40 North American Silver, Gold or Platinum support and ADC players through two independent routes. Ask a club lead or coach to share `/pilot?from=club` with members. Ask a different player-community moderator for permission to share `/pilot?from=community`. Give both the same one-paragraph invitation. Record actual inviter time by channel in the weekly operations review notes outside the platform; keep only totals. Avoid purchasing traffic and repeatedly soliciting uninterested players.

Suggested invitation for a host to send after obtaining permission:

> We’re testing whether support and bot carry players can get a useful second opinion after a match. Bring one decision, such as when to recall or which item to finish. You can mark the answer that helped and follow up after your next game. The trial runs for four weeks. The sign-up page explains exactly what we count and how to leave.

Use `PILOT_HOST_EMAILS` for invited facilitators, including the founder, coaches or captains expected to seed replies. Admin accounts are always classified as staff. Participants select their recruitment source themselves. Remind hosts to enroll. Cohort eligibility checks the linked primary NA snapshot, Silver–Platinum Solo/Duo rank, and recent bot or support play. A linked profile may be claimed. Treat recruitment-channel comparisons as descriptive. A user joins only after affirmatively agreeing to measurement.

## Weekly operating rhythm

1. Run a two-person synthetic safety drill before the first invitation and once each week. One responder submits a benign test report in staging, the second acknowledges it and checks routing, restricted evidence access, user notification and the ability to pause publishing. Record pass/fail and time spent. An unresolved urgent incident or failed routing warrants pausing recruitment until responders can cover it.
2. Invite five consenting players a week to a short interview, with a mix of contributors, quiet returners and people who did not come back. Use familiar opt-in channels. Ask about their most recent actual question, where they asked it first, how long a reply took, what they tried, and what caused them to reopen the app. For a player who left, ask what they used instead. Keep anonymous themes; do not copy names, handles, screenshots or match records into pilot tracking. Log actual completed interviews.
3. Hosts may post their own questions and answer players. Keep invitations, moderation and staff-led answers separate from independent demand. Sample a random selection of visible independent replies using a reproducible start and interval from the week's questions. Have two reviewers agree on whether the reply names a specific decision and an action to try. Record the sample and actionable counts. Record unanswered questions and common failure points in aggregate.
4. Record facilitation and moderation minutes once per activity, plus actual allocated weekly infrastructure/provider costs in USD cents. Exclude shared overhead unless the same allocation method is used every week. Compare cash spend and staff hours per helpful exchange with the previous week once any exist. Use `/admin/pilot`; saving a week replaces its totals.
5. Interview coaches and club organizers about their current review process. Ask what group budget exists and whether they would host a free trial with a named date. The optional `/pilot` survey captures stated budget and willingness only. Validate any commitment independently before treating it as a scheduled trial. No charges or checkout are part of this test.

## Human hosts and automated patch updates

Ask one bot-carry host and one support host to confirm their own review-hour shifts. The Home feed and Review Hour show confirmed roles. The official patch account supplies one labeled prompt in Patch & Meta for each confirmed game patch. Hosts can open the two role-specific unanswered-question lists from Review Hour, reply under their own names and ask the author what happened in their next game. The pilot dashboard separates host answers from independent answers. Review the proportion of real questions receiving a helpful independent reply and the time authors waited for it. Assign safety decisions to the designated reviewers.

## Planning a duo evening

Adults can optionally count one NA bot-carry or support role for the proposed Friday evening hour at `/pilot#duo-evening`. The time is Saturday 02:00 UTC and displays in the visitor’s local zone. The private choice expires at the start and is purged by the daily cleanup. Staff see two role totals. A proposed session needs confirmed staffing and the ordinary verified matching gates before players can meet. A new week starts with fresh availability.

Verified study participants can separately consent to sample the first foreground Suggested-board visit each UTC day for which they are eligible and have saved a fit plan. A fresh server-side board query records whether it found a new partner the player could request. Refreshes on the same day keep the first result. Read the number of sampled player-days alongside the count with zero available fits. Players may stop this sampling and erase its flags from the pilot page, or withdraw from the entire study. These totals describe participating players only.

## Week-four decision

Aim to finish recruitment within seven days so the entire cohort can mature before its account-linked measurements expire. The dashboard computes results over the first 40 consenting non-host players. Require both recruitment channels, at least 20 genuine decision questions from at least 10 non-team askers, and at least 60% of eligible questions receiving a useful independent reply posted within 24 hours. The author must mark it helpful during their 28-day window. Compare those answers with staff and invited-host answers. Show unanswered questions in the denominator once they are 24 hours old and had a full day left in the pilot when posted, and use the reply timestamp for timeliness. Replacements, withdrawn consent and removed content can change these live counts; note the measurement date.

Look for at least 10 of those first 40 players reading an answer or contributing on days 22–28 after **their own** enrollment. An answer view requires the end of the selected reply to be visible for a second in a foreground tab. It is an exposure proxy. Opening a generic feed or checking a player's stats alone does not count. The dashboard separates answer readers, contributors, other browsing and stats-only returns. First-week activation is marking a first useful non-host answer divided by players who have finished their first seven days. A skipped week carries no penalty.

Wait for the last cohort member’s full 28-day window. Expand to one adjacent role or region only if the targets are met and the weekly workload is sustainable. If hosts supplied most useful answers, run a second, smaller trial focused on finding independent answerers. If enough players asked but few returned, interview the players who received answers before adding another surface. Insufficient enrollment or elapsed time is an inconclusive result.

## Research privacy

The service keeps an account reference, enrollment timestamp, cohort, role and at most three boolean visit flags per pilot day. Participation ends on day 28. Joining is optional and withdrawal at `/pilot` deletes account-linked pilot and survey rows immediately, including daily flags. The authenticated daily maintenance job purges membership and flags after 56 days and removes survey rows 56 days after their last update. The dashboard reads eligible existing social activity and shows aggregates to admins. A non-host participant may separately volunteer once on the weekly featured discussion. For an uninterrupted foreground visit in that tab and up to 30 minutes, the pilot can count opening another visible thread and publishing a new visible question. Only the sample start time and two boolean results are retained. Totals describe consenting participants’ actions and cannot establish causation. Sample rows are removed with membership. It stores no research copy of conversations, raw sessions, visited URLs or match history. Staff-entered weekly totals contain no participant identifiers. Check maintenance and save an aggregate-only decision snapshot before cohort membership expires.

## Duo Finder conversion study

Participants with eligible verified profiles can separately volunteer at `/pilot#duo-study` when matching opens. Existing review-pilot enrollment grants no duo research consent. Each consent lasts 28 days. `/admin/pilot` shows current outcomes for new requests in two cohorts, always after enrollment. The first covers the trailing seven days. The second covers a completed Monday-to-Monday UTC week, ending at least seven days before the review. For both, the opening bound is included and the ending bound excluded. Every member of the older request cohort has had at least one week to convert. Results use the outcomes observed today, conditional on both players still having active consent. Review the dashboard weekly and date any aggregate-only observations you save.

Count the distinct people who submitted a safe listing, sent a request or accepted an incoming request. A participant can contribute their own actions when the other player has not enrolled. A pair counts only when both players opted in before the request and still have active consent. Multiple requests between the same two people, including in alternating directions, count as one pair. Report stages as requested pairs → accepted pairs → pairs with a confirmed shared game → pairs currently both choosing to queue again. Show unique people alongside these counts. The median wait covers accepted invitations only and uses their creation and acceptance timestamps. Shared game confirmation uses the same official start time and visible reciprocal teammate evidence in two verified recent snapshots, either observed now or retained by a private game check. An ordinary thank-you and a shared match ID on opposing teams do not qualify.

Readers see totals only. The research table stores the volunteering account, consent revision and enrollment time. Withdrawing at `/pilot` immediately removes that member and each associated pair from measurements. Expired records are ignored after day 28 and deleted by daily maintenance. Configure all facilitators and production QA accounts via `PILOT_HOST_EMAILS`, `ADMIN_EMAILS` and `PILOT_FIXTURE_EMAILS` before the study. The publisher, known staff and reserved fixture addresses are excluded on either side of an interaction. Local synthetic tests use an isolated in-memory database.

Treat zero eligible pairs as insufficient evidence. For a small pilot, discuss observed lost steps with willing participants before expanding. Recent requests are still maturing. Archived-out match evidence, opt-in selection and consent withdrawals affect counts. A mutual choice records intent. A separately observed repeat requires a distinct same-team game on a later UTC date within 168 hours of the observed first game. Only pairs with a full elapsed seven days since that first game enter the repeat denominator. Unverified results with incomplete snapshot coverage are reported as unknown. This measure requires a new consent version from both participants before the invitation.

## Five-player phone test

Before recruiting the larger cohort, ask five consenting adult volunteers to try the same task. Aim for both iOS and Android and a mixture of mail apps. Use an existing visible matchup with a real answer. If using staging, establish a question and an answer there before the session. Ask the host to send its ordinary public thread URL through Discord with permission. A production reply will be public and may be held for safety review. Let participants choose whether to publish. Exclude host and field-test activity from evidence of demand.

Give each player the guide at `/pilot/phone-test` separately. Start them signed out in the browser they normally use for Discord. Ask them to read the shared matchup and an answer, draft a reply, sign in using their own inbox, find that same reply, post it once if willing, and locate Duo Finder. Observe until they ask for help. Count “pending review” as an acknowledged submission. Check for duplicate submissions separately. Do not handle passwords, look at inboxes, record screens or keep private IDs. A participant may stop, or decline to publish, without a failed tally.

One coordinator keeps the following **aggregate-only** worksheet offline for each test round. Count one first-failure stage per blocked person. Count any assisted recovery separately. Never put names, handles, associated accounts, private thread addresses or email links into the sheet.

| Outcome | Count for this round |
|---|---|
| Consented and started | |
| Opened the thread and found an answer unaided | |
| Drafted a reply and received the requested email | |
| Returned to the same thread after confirmation | |
| Draft restored automatically in the original browser | |
| Switched browsers and recovered the text with Copy draft | |
| Chose to publish / received confirmation unaided / duplicate submissions | / / |
| Found Duo Finder and understood its availability unaided | |
| Completed the full chosen task unaided / with help / stopped voluntarily | / / |
| First blockage in opening / composing / mail delivery / confirmation / draft restoration / submission / finding Duo Finder | / / / / / / |
| Cross-browser switch observed / small-screen control clipped or covered | / |

Report counts over actual attempts at each step. A missing email, a switch between Discord and Safari or Chrome, and a moderation hold have different causes. Re-run the earliest repeated failure after a fix. A full physical test requires five volunteers, real inboxes and actual devices. The synthetic test in `src/lib/auth-flow.test.ts` exercises seeded data, individual browser-storage contexts and the production route functions without sending email.
