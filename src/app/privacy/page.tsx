import { SUPPORT_EMAIL } from "@/lib/brand";

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} className="card">
      <h1 className="page-title">Privacy Policy</h1>
      <p className="meta">Last updated: November 26, 2026</p>
      <h2 className="section">What we store</h2>
      <ul>
        <li><strong>Account:</strong> your email address (for sign-in links), display name, bio, avatar color, privately declared age band, and the terms version you accepted. Your public profile does not show your age group.</li>
        <li><strong>Social content:</strong> posts, comments, reactions, follows, room memberships, endorsements, time-limited duo listings, structured duo requests, private choices about playing together again, and reports you make or receive. After an eligible duo session, both players must opt in before either sees that the other wants another game.</li>
        <li><strong>Riot data:</strong> if you link or look up a Riot ID, we cache that player&apos;s <em>recent form only</em> — roughly the last 20 matches and current rank — refreshed on demand and overwritten on each refresh. We deliberately do <strong>not</strong> build a permanent archive of anyone&apos;s match history.</li>
        <li><strong>Moderation records:</strong> filter scores, held/removed content, reports, and sanctions, kept so enforcement is consistent and appealable. When U.S. law requires preservation after a qualifying CyberTipline report, the one-year period runs from the completed submission. A legal hold can require longer retention. Designated responders handle urgent evidence.</li>
        <li><strong>Safety signals:</strong> sign-in and participation rate limits use time-limited counters. Staff keep restricted records of enforcement and appeals. We use these records to review abuse and correct mistakes.</li>
      </ul>
      <h2 className="section">Private community tools</h2>
      <p>Your optional duo plan stores only your role, preferred partner role, play times, playstyle and chat preference. Only you can view or clear it in Duo Finder. Saving it never publishes a listing.</p>
      <p>Your saved posts, saved replies and watched discussions belong to your account. Your playbook is private. Other players see the reply you mark helpful and any follow-up you choose to post publicly.</p>
      <p>The optional four-week community pilot records days of participation, grouped by activity, and your recruitment channel. The pilot page explains retention and how to withdraw. An enrolled player may also opt in once on a featured matchup. For up to 30 minutes in that tab, the pilot records the start time and whether they open another visible discussion or post a new visible question. The sample stores no page addresses or post IDs and is erased with the pilot records. A club or coaching interest submission is optional. We do not send this data to advertising services.</p>
      <h2 className="section">What we don&apos;t do</h2>
      <ul>
        <li>No sale of personal data. No advertising trackers. No password storage — there are no passwords.</li>
        <li>Display names are pseudonymous by design; we never require your real name.</li>
      </ul>
      <h2 className="section">Drafts during sign-in</h2>
      <p>If you start a post or reply before signing in, this browser can hold the draft while you use your email link. The app restores it once, for up to 30 minutes. Your email contains a sign-in link. Draft text stays in this browser until you submit it. Signing out clears saved sign-in drafts from the device.</p>
      <h2 className="section">Your choices</h2>
      <p>You can unlink a Riot ID at any time from your profile, which removes its association with your account. To delete your account and social content, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from your account email. Some case records may need to be preserved to address ongoing abuse, review an appeal or meet a legal obligation. Contact us about a suspected under-13 account so we can review it and remove data as required.</p>
      <h2 className="section">Third parties</h2>
      <p>We use the Riot Games API for player data, Resend to deliver sign-in emails, and Vercel/Neon for hosting and database services. When managed text screening is enabled, OpenAI processes submitted text fields for moderation. The screening request excludes account IDs, age bands and account email addresses. Game data displayed here belongs to Riot Games and the players who generated it.</p>
    </div>
  );
}
