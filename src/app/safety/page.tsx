import Link from "next/link";
import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/brand";
export const metadata: Metadata = {title:"Safety centre"};
export default function SafetyCentre() {
  return <article className="card reading-page">
    <h1 className="page-title">Safety centre</h1>
    <p>Report a problem from the menu beside a post, reply, profile, room or duo request. The person you report will not see your identity.</p>
    <section><h2 className="section">Your reports and appeals</h2><p>Check your private inbox for the outcome of a report or a decision about your content. A notice explains the rule, the action, how long it lasts and how you can appeal. A different moderator considers the appeal.</p>
      <Link href="/me/safety">Open my safety inbox</Link></section>
    <section><h2 className="section">If someone is in danger</h2>
      <p>If someone faces immediate danger, contact local emergency services. Use the child safety category for grooming, sextortion, trafficking or sexual content involving anyone under 18. A designated responder reviews urgent reports.</p>
      <p>If you cannot sign in, send the link and approximate time to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Keep explicit images, downloads, private identifiers and passwords out of email. You can also contact the U.S. <a href="https://www.missingkids.org/gethelpnow/cybertipline">CyberTipline</a>.</p></section>
    <section><h2 className="section">Stay in control of a conversation</h2><p>Blocking stops contact between the two accounts. Muting hides someone’s contributions from your view. You can use either without filing a report. Use the in-app duo request to decide whether to connect. Voice is optional.</p></section>
    <section><h2 className="section">Contact the safety team</h2><p>For a locked account, a moderator complaint, a privacy request or an official inquiry, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Include the post link or case number if you have it.</p></section>
    <Link href="/guidelines">Community guidelines</Link> · <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
  </article>;
}
