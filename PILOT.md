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

## Week-four decision

Aim to finish recruitment within seven days so the entire cohort can mature before its account-linked measurements expire. The dashboard computes results over the first 40 consenting non-host players. Require both recruitment channels, at least 20 genuine decision questions from at least 10 non-team askers, and at least 60% of eligible questions receiving a useful independent reply posted within 24 hours. The author must mark it helpful during their 28-day window. Compare those answers with staff and invited-host answers. Show unanswered questions in the denominator once they are 24 hours old and had a full day left in the pilot when posted, and use the reply timestamp for timeliness. Replacements, withdrawn consent and removed content can change these live counts; note the measurement date.

Look for at least 10 of those first 40 players reading an answer or contributing on days 22–28 after **their own** enrollment. An answer view requires the end of the selected reply to be visible for a second in a foreground tab. It is an exposure proxy. Opening a generic feed or checking a player's stats alone does not count. The dashboard separates answer readers, contributors, other browsing and stats-only returns. First-week activation is marking a first useful non-host answer divided by players who have finished their first seven days. A skipped week carries no penalty.

Wait for the last cohort member’s full 28-day window. Expand to one adjacent role or region only if the targets are met and the weekly workload is sustainable. If hosts supplied most useful answers, run a second, smaller trial focused on finding independent answerers. If enough players asked but few returned, interview the players who received answers before adding another surface. Insufficient enrollment or elapsed time is an inconclusive result.

## Research privacy

The service keeps an account reference, enrollment timestamp, cohort, role and at most three boolean visit flags per pilot day. Participation ends on day 28. Joining is optional and withdrawal at `/pilot` deletes account-linked pilot and survey rows immediately, including daily flags. The authenticated daily maintenance job purges membership and flags after 56 days and removes survey rows 56 days after their last update. The dashboard reads eligible existing social activity and shows aggregates to admins. A non-host participant may separately volunteer once on the weekly featured discussion. For an uninterrupted foreground visit in that tab and up to 30 minutes, the pilot can count opening another visible thread and publishing a new visible question. Only the sample start time and two boolean results are retained. Totals describe consenting participants’ actions and cannot establish causation. Sample rows are removed with membership. It stores no research copy of conversations, raw sessions, visited URLs or match history. Staff-entered weekly totals contain no participant identifiers. Check maintenance and save an aggregate-only decision snapshot before cohort membership expires.

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
