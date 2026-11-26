import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { myNotices, myReports, followCounts } from "@/lib/social";
import { playerFromRow } from "@/lib/riot";
import { Avatar, rankLabel } from "@/components/ui";
import { LinkForm, ProfileForm, SignOutButton, UnlinkButton } from "@/components/me-ui";

export const dynamic = "force-dynamic";

export default async function MePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/signin");
  const [counts, reports, notices, linkRows] = await Promise.all([
    followCounts(user.id),
    myReports(user.id).catch(() => []),
    myNotices(user.id).catch(() => []),
    q`SELECT p.* FROM wp_links l JOIN wp_players p ON p.puuid = l.puuid WHERE l.user_id = ${user.id} ORDER BY l.is_primary DESC`.catch(() => []),
  ]);
  const linked = linkRows.map((r) => playerFromRow(r));

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {sp.welcome && <div className="notice ok">🎉 You&apos;re in! Link your Riot ID below to unlock your flair, champion rooms, and the duo board.</div>}
      <div className="card">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar name={user.displayName} hue={user.avatarHue} size={58} />
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 23 }}>{user.displayName}</h1>
            <div className="meta">{user.email} · {counts.followers} followers · {counts.following} following · <Link href={`/u/${user.id}`}>View public profile</Link></div>
          </div>
          <SignOutButton />
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Profile</h2>
        <ProfileForm name={user.displayName} bio={user.bio} />
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>My Riot IDs</h2>
        {linked.length === 0 && <p className="meta">None linked yet. Linking powers your rank flair, auto-joins your top champions&apos; rooms, and unlocks LFG.</p>}
        {linked.map((p) => (
          <div key={p.puuid} className="match-row">
            <div style={{ flex: 1 }}>
              <strong>{p.gameName}#{p.tagLine}</strong>
              <div className="meta">{rankLabel(p.rankTier, p.rankDiv, p.rankLp)} · {p.platform.toUpperCase()}</div>
            </div>
            <Link className="text-btn" href={`/player?platform=${p.platform}&riotId=${encodeURIComponent(`${p.gameName}#${p.tagLine}`)}`}>Stats →</Link>
            <UnlinkButton puuid={p.puuid} label={`${p.gameName}#${p.tagLine}`} />
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <LinkForm />
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Moderation &amp; my reports</h2>
        {notices.length > 0 && (
          <>
            <strong style={{ fontSize: 15 }}>Notices about your content</strong>
            {notices.map((n) => (
              <div key={n.id} className="notice warn" style={{ margin: "8px 0" }}>
                Your content was <strong>{n.action === "remove" ? "removed" : n.action === "hold" ? "held for review" : "blocked"}</strong>
                {n.detail ? <> — {n.detail}</> : null}. If you think this was a mistake, reply to the safety contact in the footer.
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
