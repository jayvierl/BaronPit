import Link from "next/link";

export const metadata = { title: "Phone test guide", robots: { index: false } };

export default function PhoneTestPage() {
  return (
    <article className="reading-page">
      <h1 className="page-title">Try a matchup thread on your phone</h1>
      <p>For players taking part in the five-person phone test. Allow about ten minutes and use the phone, email app and Discord browser you usually use.</p>
      <section>
        <h2>Your task</h2>
        <ol>
          <li>Open the matchup link your host shared in Discord. Read the question and a player’s answer.</li>
          <li>Write one reply you’d be comfortable sharing publicly. You can suggest another play or ask for more detail.</li>
          <li>Sign in or create an account when prompted. Open the email yourself and confirm in the browser you would normally use.</li>
          <li>Find your draft and check it. Send it once if you want to publish. Tell your host which confirmation you saw.</li>
          <li>From the thread, find where you would look for a duo partner. Tell your host whether you could tell which actions were available to you.</li>
        </ol>
      </section>
      <section>
        <h2>If you get stuck</h2>
        <p>Tell your host the first step that was difficult. You can stop at any time. Keep your inbox, confirmation link, email address and account details private.</p>
        <p>The host records only progress through these steps. <Link href="/questions?mode=answered">Browse answered matchups</Link> or <Link href="/pilot">return to the pilot</Link>.</p>
      </section>
    </article>
  );
}
