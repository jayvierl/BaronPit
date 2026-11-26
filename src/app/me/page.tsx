import { recentSubmissions } from "@/lib/submissions";
import { WithdrawSubmission } from "@/components/withdraw-submission";
import { riotSignOnConfig } from "@/lib/riot-ownership";
import { VerifyRiotButton } from "@/components/verify-riot";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { myNotices, myReports, followCounts } from "@/lib/social";
import { linkedPlayers } from "@/lib/player-insights";
import { socialRankLabel } from "@/lib/player-summary";
import { Avatar } from "@/components/ui";
import { LinkForm, SignOutButton, UnlinkButton, PrimaryPlayerButton } from "@/components/me-ui";

const verificationMessages: Record<string,string> = {
  verified: "Riot confirmed ownership of your linked profile.",
  mismatch: "This Riot login could not verify the selected profile. Check the Riot ID and try again.",
  cancelled: "Riot verification was cancelled.",
  restart: "Start a new verification from the profile you want to verify.",
  unavailable: "Riot verification did not finish. Try again from your linked profile.",
};

export const dynamic = "force-dynamic";

export default async function MePage({ searchParams }: { searchParams: Promise<{ welcome?: string; verification?: string; beforeSubmission?: string; updated?: string }> }) {
  const [sp,user] = await Promise.all([searchParams,getCurrentUser()]);
  if (!user) redirect("/signin");
  const [counts,reports,notices,linked,receipts] = await Promise.all([
    followCounts(user.id),myReports(user.id),myNotices(user.id),linkedPlayers(user.id),recentSubmissions(user.id,sp.beforeSubmission),
  ]);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {sp.updated === "1" && <p className="notice ok" role="status">Profile updated.</p>}
      {sp.verification && <p className="notice" role="status">{(Object.hasOwn(verificationMessages,sp.verification) && verificationMessages[sp.verification]) || "Check your Riot links below."}</p>}
      {!user.termsCurrent && <p className="notice"><Link href="/signin?enrol=1">Confirm your age group and accept the community terms</Link> before posting.</p>}
      {sp.welcome && <div className="notice ok">🎉 You&apos;re in! Link a Riot ID to follow its recent form and find champion rooms.</div>}
      <div className="card">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar name={user.displayName} hue={user.avatarHue} avatar={user.avatar} size={58} />
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 23 }}>{user.displayName}</h1>
            <div className="meta">{user.email} · {counts.followers} followers · {counts.following} following · <Link href={`/u/${user.id}`}>View public profile</Link></div>
          </div>
          <SignOutButton />
        </div>
      </div>

      <div className="card">
        <nav className="account-shortcuts" aria-label="My community"><Link href="/lfg">My duo preferences</Link><Link href="/activity">Thread activity</Link><Link href="/playbook">My playbook</Link><Link href="/pilot">Community pilot</Link>{isAdmin(user.email) && <Link href="/admin/pilot">Pilot results</Link>}</nav>
        <Link href="/profile/edit?from=account" className="btn secondary">Edit profile</Link>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Linked Riot IDs</h2>
        {linked.length === 0 && <p className="meta">None linked yet. Linking keeps a player’s recent form handy and joins their top champion rooms. Public rank flair requires verified Riot ownership.</p>}
        {linked.map((p) => (
          <div key={p.puuid} className="match-row">
            <div style={{ flex: 1 }}>
              <strong>{p.gameName}#{p.tagLine}</strong>
              <div className="meta">{socialRankLabel(p, true)} · {p.platform.toUpperCase()} · {p.verified ? "Verified link" : "Unverified link"}{p.primary && " · Primary"}</div>
            </div>
            <Link className="text-btn" href={`/player?platform=${p.platform}&riotId=${encodeURIComponent(`${p.gameName}#${p.tagLine}`)}`}>Stats →</Link>
            {!p.verified && riotSignOnConfig() && <VerifyRiotButton puuid={p.puuid}/>}
            {p.verified && !p.primary && <PrimaryPlayerButton puuid={p.puuid} />}
            <UnlinkButton puuid={p.puuid} label={`${p.gameName}#${p.tagLine}`} />
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <LinkForm />
        </div>
      </div>

      <section className="card" id="submissions" aria-labelledby="my-submissions">
        <h2 id="my-submissions">My submissions</h2>
        {receipts.entries.some(entry => entry.status === "held") && (
          <p className="meta">A moderator will review your submission before other players can see it. You can withdraw it here at any time.</p>
        )}
        {receipts.entries.length === 0 && <p className="meta">Your post and reply receipts appear here.</p>}
        {receipts.entries.map(entry=><article className="match-row" key={entry.kind+entry.id}>
          <div style={{flex:1}}>
            <strong>{entry.kind==="post"?"Post":"Reply"} #{entry.id}</strong>
            <span className="chip">{({visible:entry.canOpen ? "Published" : "Thread unavailable",held:"Awaiting review",removed:"Removed",withdrawn:"Withdrawn"})[entry.status]}</span>
            {entry.excerpt && <p>{entry.excerpt}</p>}
            <div className="meta">Submitted <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("en-US",{timeZone:"UTC"})} UTC</time></div>
          </div>
          {entry.canOpen && <Link href={`/post/${entry.postId}${entry.kind==="comment"?"#reply-"+entry.id:""}`}>Open thread</Link>}
          {entry.status==="removed" && <Link href="/me/safety">Safety inbox</Link>}
          {entry.status!=="withdrawn" && <WithdrawSubmission kind={entry.kind} id={entry.id}/>}
        </article>)}
        {receipts.next && <Link href={`/me?beforeSubmission=${receipts.next}#submissions`}>Older submissions</Link>}
        {sp.beforeSubmission && <Link href="/me#submissions"> Latest submissions</Link>}
      </section>

      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Moderation &amp; my reports</h2><p><Link href="/me/safety">Open my safety inbox</Link></p>
        {notices.length > 0 && (
          <>
            <strong style={{ fontSize: 15 }}>Prepublication checks</strong>
            {notices.map((n) => (
              <div key={n.id} className="notice warn" style={{ margin: "8px 0" }}>
                A safety check blocked a submission. You can edit your wording and submit a new draft. <Link href="/guidelines">Community guidelines</Link>
                <div className="meta">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </>
        )}
        {reports.length === 0
          ? <p className="meta">You haven&apos;t reported anything. When you do, outcomes show up here — reports are never a shout into the void.</p>
          : reports.map((r) => (
            <div key={r.id} className="match-row">
              <span style={{ flex: 1 }}>Report on {r.targetKind} #{r.targetId}</span>
              <span className="chip">{r.status === "open" ? "under review" : r.status}</span>
              <span className="meta">{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        {isAdmin(user.email) && <p style={{ marginTop: 10 }}><Link href="/admin/moderation" className="btn small">Open the moderation queue →</Link></p>}
      </div>
    </div>
  );
}
