import type { Metadata } from "next";
import { APP_NAME, SAFETY_EMAIL } from "@/lib/brand";

const TERMS_TITLE = "Terms of Use";
const TERMS_DESCRIPTION = "The terms for using Baron Pit: accounts, your content, acceptable use and how to reach us with questions, appeals and safety reports.";
export const metadata: Metadata = {
  title: TERMS_TITLE,
  description: TERMS_DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: { title: TERMS_TITLE, description: TERMS_DESCRIPTION },
  twitter: { title: TERMS_TITLE, description: TERMS_DESCRIPTION },
};

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} className="card">
      <h1 className="page-title">Terms of Use</h1>
      <p className="meta">Last updated: November 26, 2026</p>
      <h2 className="section">1. The service</h2>
      <p>{APP_NAME} is a fan-made community platform for League of Legends players: social posting, rooms, build sharing, duo finding, and player statistics fetched from the Riot Games API. It is free to use. {APP_NAME} isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views of Riot Games or anyone officially involved in producing or managing League of Legends.</p>
      <h2 className="section">2. Accounts</h2>
      <p>You sign in with a one-time email link; keep your email account secure, since it is your key. You must be at least 13 years old and accept the current terms before contributing. We ask for an age band and keep it private. Linking a Riot ID is a claim of association used for display and rooms. A claim cannot unlock verified duo contact and it does not transfer any rights in that Riot account.</p>
      <h2 className="section">3. Your content</h2>
      <p>You own what you post. By posting, you grant {APP_NAME} a non-exclusive license to display, store, and distribute your content as part of the service and to moderate it. You agree not to post content prohibited by the <a href="/guidelines">Community Guidelines</a>, which are part of these terms. We may remove content or restrict accounts that violate them, following the enforcement process described there. You can appeal through your safety inbox or email if you cannot sign in.</p>
      <h2 className="section">4. Acceptable use</h2>
      <p>No scraping at abusive rates, no automated account creation, no ban evasion, no interfering with the service or other users&apos; access. Player statistics shown here come from the Riot API and may be briefly cached; they are provided as-is.</p>
      <h2 className="section">5. Liability</h2>
      <p>The service is provided “as is” without warranties. To the extent allowed by law, {APP_NAME} is not liable for indirect or consequential damages arising from use of the service.</p>
      <h2 className="section">6. Contact</h2>
      <p>Questions, appeals, and safety reports: <a href={`mailto:${SAFETY_EMAIL}`}>{SAFETY_EMAIL}</a>.</p>
    </div>
  );
}
