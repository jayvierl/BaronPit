# Community safety operations

Players can report content where it appears, contact the operator from the public Safety Center, and review their reports and appeal notices in their private inbox. Staff can review cases at `/admin/moderation`. The player inbox is at `/me/safety`. Give locked-out players the email address published at `/safety`.

## Before launch

1. Appoint a trained primary and backup responder. Give each an individual account, require MFA on their staff email and infrastructure access, and confirm both receive urgent alerts. Ordinary staff are listed in `ADMIN_EMAILS`. Urgent responders must also appear in `SAFETY_OWNER_EMAILS`. Exercise the secondary reviewer and missed-page handover before opening contributions.
2. Verify the safety mailbox is monitored and receives mail from a player who cannot sign in. Rehearse a report, a protected hold, a correct decision, a mistaken decision and a successful appeal. Use synthetic accounts and innocuous fixtures.
3. With qualified counsel, approve the terms, age and privacy procedures, ordinary log and appeal retention, release markets, child-safety reporting contact and provider preservation procedures. Account age bands are self-declared. Operate no adult spaces or open stranger DMs.
4. Keep native uploads paused pending private quarantine, approved screening and evidence custody. A known abusive media hash, a player report and a confirmed external filing are different events. Inventory historical public Blob objects through an authorised operator. Changing a post’s status cannot revoke a previously distributed public URL. See [Duo and media operations](DUO-AND-MEDIA.md).
5. Set the optional `MODERATION_OPENAI_API_KEY` only after approving the processor, privacy notice and use of its moderation endpoint. Local text checks still apply. An outage in a configured screening service sends eligible submissions to review or defers a change that cannot be safely published. A classifier alone cannot impose an account ban.
6. Store the settings in Vercel and on the approved worker as needed. Keep receipts, evidence and private reports out of public analytics and general application logs. Preview, seeded test and production data are separate.

## Triage and appeals

| Priority | Internal operating target when staffed | Action |
|---|---|---|
| P0, child safety, credible threat, imminent self-harm or exposed private information | Page immediately and target first protective action within one hour | Restrict exposure. Designated responder assesses urgency. Escalate unacknowledged pages to the backup. |
| P1, targeted harassment, hate, sexual harassment, scam | Four covered hours | Review context and stop unwanted contact. |
| P2, routine report or held contribution | 24 hours | Record the applicable rule and outcome. |
| Routine appeal | 72 hours | A different moderator assesses the decision. |

Treat these intervals as operating targets to staff and monitor. Apple Guideline 1.2 requires timely responses. It does not prescribe a universal 24-hour deadline. An unavailable staff member or provider should trigger an incident decision, including a pause if there is no safe coverage.

Record the rule, content reference, time, action and duration. Keep the reporter private from the reported player. Independent reporters can trigger a temporary hold. Staff decide the merits on the content and context. Appeals can correct a sanction, notify affected reporters and restore eligible content. Protected items require additional owner review before release. Keep unrelated active restrictions in effect.

Quote posts go through normal screening and appear in the original room. They store the writer’s own commentary and a reference. Each reader sees the original excerpt only while it is available to them and to the quote writer. When the original is withdrawn, held, removed or muted, eligible readers can still read the commentary with a generic unavailable notice. A block between the reader and the original author hides the quote entirely for that reader. The original author receives no notification for a quote alone.

## Urgent paging

Run `node scripts/safety-pager.mjs` under a supervised service after the schema migration. It polls the durable urgent-case ledger every 15 seconds, leases pending deliveries, retries on failure and tracks successful receipt delivery. `--once` runs one batch. Configure a private HTTPS receiver with `SAFETY_PAGE_HTTPS_URL` and `SAFETY_PAGE_TOKEN`. The worker needs a restricted database role with column access to urgent receipt, opening and review time and read/write access to its separate delivery table. Keep it outside the web process. Do not configure external webhooks for the local test suite.

The payload contains an opaque receipt, opening time and event type. The receiver must authenticate the bearer, deduplicate the Idempotency-Key, persist a page before acknowledging it and escalate to the backup if a human has not acknowledged. Monitor worker heartbeat separately and test a receiver outage. Check the owner queue manually if paging fails. Transport acceptance does not measure human response time. Never copy the original text, image, link, player name or case notes into pager messages.

For a raid in a single room, use the staff room controls. The preset lasts 15 minutes, pauses links and spaces one player’s posts and replies by at least 15 seconds. Log the reason and restore earlier if the room settles.

During a site-wide incident set `SAFETY_PAUSE_PUBLICATION=true` and redeploy. It pauses new contributions while protective actions, appeals and staff review stay available. Use individual holds to address material already visible; the switch does not retrospectively hide posts. Confirm staffing, paging, queue status and provider health before reopening.

## Child-safety handling

A trained responder should contain suspected material immediately. Use the restricted case receipt and the authorised evidence process. Keep explicit files out of ordinary queues, chat, email and personal devices. Ordinary moderators can pass a difficult case without viewing or redistributing it. If someone is in immediate danger, use the appropriate emergency channel.

One case receipt can have multiple evidence records. In the restricted evidence store, look up screened submissions in `wp_safety_text_evidence` and photos in `wp_profile_photo_evidence` by receipt. Older screened submissions may reside in the original restricted case record. A newly captured item cancels any pending release approval for that case.

In the United States, covered providers that obtain actual knowledge of facts indicating an apparent covered offence must report to NCMEC as soon as reasonably possible. The statutory one-year preservation period for covered records begins with a completed submission. An applicable legal hold can require more time. Record the submission reference and time, limit access, preserve the covered material under protected custody and confirm lawful disposal with a second person. The application does not file external reports. Staff need the reporting relationship and verified custody process in place. Coordinate an under-13 account complaint with the privacy lead and remove information as required, subject to any applicable hold.

## Operating review

Review response time by severity, report outcomes and appeal reversals weekly. Investigate repeat incidents and false positives with de-identified examples. For prevalence estimates, sample eligible content independently of reports and specify the sample size. Avoid small public counts that identify a player. Rotate difficult shifts and use handovers with case receipts and deadlines. At 2,000 contributions per day, a 10% human-review rate and 25 seconds per item imply about 1.4 hours of review per day before reports and appeals. Replace those assumptions with actual workload before setting staff schedules.

## Primary references

- [Apple App Review Guidelines, section 1.2](https://developer.apple.com/app-store/review/guidelines/) and [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937)
- [Google Play child-safety standards](https://support.google.com/googleplay/android-developer/answer/14747720)
- [18 USC §2258A](https://www.govinfo.gov/content/pkg/USCODE-2024-title18/html/USCODE-2024-title18-partI-chap110-sec2258A.htm) and [NCMEC CyberTipline](https://www.missingkids.org/gethelpnow/cybertipline)
- [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) and [Riot Community Pact](https://www.riotgames.com/en/community-pact)
