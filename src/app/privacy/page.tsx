import { APP_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} className="card">
      <h1 className="page-title">Privacy Policy</h1>
      <p className="meta">Last updated: November 25, 2026</p>
      <h2 className="section">What we store</h2>
      <ul>
        <li><strong>Account:</strong> your email address (for sign-in links), display name, bio, and avatar color.</li>
        <li><strong>Social content:</strong> posts, comments, reactions, follows, room memberships, endorsements, LFG listings, and reports you make or receive.</li>
        <li><strong>Riot data:</strong> if you link or look up a Riot ID, we cache that player&apos;s <em>recent form only</em> — roughly the last 20 matches and current rank — refreshed on demand and overwritten on each refresh. We deliberately do <strong>not</strong> build a permanent archive of anyone&apos;s match history.</li>
        <li><strong>Moderation records:</strong> filter scores, held/removed content, reports, and sanctions, kept so enforcement is consistent and appealable. Content reported as suspected child sexual abuse material is preserved for one year as US law (18 USC §2258A, as amended by the REPORT Act) requires after a report to NCMEC.</li>
        <li><strong>Safety signals:</strong> if an account is banned, we retain hashed identifiers (email, linked Riot ID) to prevent ban evasion. These are access-controlled and never displayed publicly.</li>
      </ul>
      <h2 className="section">What we don&apos;t do</h2>
      <ul>
        <li>No sale of personal data. No advertising trackers. No password storage — there are no passwords.</li>
        <li>Display names are pseudonymous by design; we never require your real name.</li>
      </ul>
      <h2 className="section">Your choices</h2>
      <p>You can unlink a Riot ID at any time from your profile, which removes its association with your account. To delete your account and social content, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from your account email. Some moderation records may be retained where the law or ban-evasion prevention requires it, as described above.</p>
      <h2 className="section">Third parties</h2>
      <p>We use the Riot Games API for player data, Resend to deliver sign-in emails, and Vercel/Neon for hosting and database services. Game data displayed here belongs to Riot Games and the players who generated it.</p>
    </div>
  );
}
