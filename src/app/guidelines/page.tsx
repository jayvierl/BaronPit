import Link from "next/link";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export default function GuidelinesPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} className="card">
      <h1 className="page-title">Community Guidelines</h1>
      <p>{APP_NAME} exists because League&apos;s community spaces kept getting shut down or drowned in spam. Keeping this one alive is a shared job. The short version: <strong>play to win, play fair, play with respect</strong> — and bring receipts (your games) instead of insults.</p>

      <h2 className="section">Not allowed</h2>
      <ul>
        <li><strong>Harassment and hate</strong> — targeted abuse, slurs, sexual harassment, or dogpiling a player. Trash talk about a play is fine; attacks on a person are not.</li>
        <li><strong>Threats, doxxing, and personal information</strong> — including details pulled from someone&apos;s profiles elsewhere.</li>
        <li><strong>Sexual content</strong> — and an absolute, zero-tolerance ban on sexual content involving anyone who is or could be a minor. It is removed immediately and reported to the National Center for Missing &amp; Exploited Children (NCMEC) as the law requires.</li>
        <li><strong>Spam and scams</strong> — account selling, boosting services, offering or asking for money to queue or win, “free RP” schemes, repetitive or duplicate posting, and clan-recruitment spam.</li>
        <li><strong>Cheating promotion</strong> — scripts, exploits, account sharing, and duo “hitchhiking” to manipulate rank.</li>
        <li><strong>Impersonation</strong> — of Riot staff, pro players, streamers, or other members.</li>
        <li><strong>Off-platform contact farming</strong> — LFG listings keep first contact in-app. No Discord handles or other contact info in listings.</li>
      </ul>

      <h2 className="section">How enforcement works</h2>
      <ul>
        <li>Automated filters review every post and comment. High-confidence violations are blocked instantly; borderline content is <em>held</em> — invisible until a human moderator approves or removes it.</li>
        <li>Independent reports can hold content for review. A single urgent report can hide content immediately. A moderator checks the context before imposing a sanction.</li>
        <li>Sanctions follow a ladder — notice → content removal → temporary restriction → suspension → permanent ban — but severe violations can skip straight to the end of it. “They started it” is not a defense; we judge each person&apos;s content on its own.</li>
        <li>Every action on your content comes with a <strong>reform card</strong>: you see what was actioned and which rule it broke, in your profile. Reporters also see outcomes — reporting here is never a shout into the void.</li>
        <li>New accounts start with lighter privileges (no links, extra filtering) and earn full ones quickly by participating normally. This is published policy, not a shadow ban.</li>
        <li>Think we got it wrong? Open <Link href="/me/safety">your safety inbox</Link> to appeal, or contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your account email and the notice date.</li>
      </ul>

      <h2 className="section">The spirit of the house</h2>
      <p>Share the off-meta build that worked. Answer the new player&apos;s question like someone once answered yours. That&apos;s the whole product.</p>
      <p><Link href="/safety">Visit the safety centre</Link></p>
    </div>
  );
}
