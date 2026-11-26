import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { modQueue } from "@/lib/social";
import { ResolveButtons } from "@/components/admin-ui";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/signin");
  if (!isAdmin(user.email)) {
    return <div className="card empty">This queue is for the moderation team only.</div>;
  }
  const queue = await modQueue().catch(() => ({ posts: [], comments: [], reports: [] }));
  const empty = queue.posts.length + queue.comments.length + queue.reports.length === 0;
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <h1 className="page-title">Moderation queue</h1>
      <p className="meta">
        Held content is invisible until approved. Three or more open reports auto-hold a post. Every removal writes a
        reform-card notice to the author, and reporters see outcomes in their profiles. Full policy:{" "}
        <Link href="/guidelines">Guidelines</Link>.
      </p>
      {empty && <div className="card empty">🎉 Queue is clear. Nothing held, nothing reported.</div>}

      {queue.posts.length > 0 && (
        <>
          <h2 className="section">Held posts ({queue.posts.length})</h2>
          {queue.posts.map((p) => (
            <div key={p.id} className="card">
              <div className="meta">{p.kind} · by <Link href={`/u/${p.authorId}`}>{p.authorName}</Link> · {new Date(p.createdAt).toLocaleString()}</div>
              <p className="post-body">{p.body || "(no text — structured post)"}</p>
              <ResolveButtons targetKind="post" targetId={p.id} authorId={p.authorId} />
            </div>
          ))}
        </>
      )}
      {queue.comments.length > 0 && (
        <>
          <h2 className="section">Held comments ({queue.comments.length})</h2>
          {queue.comments.map((c) => (
            <div key={c.id} className="card">
              <div className="meta">on <Link href={`/post/${c.postId}`}>post #{c.postId}</Link> · by <Link href={`/u/${c.authorId}`}>{c.authorName}</Link> · {new Date(c.createdAt).toLocaleString()}</div>
              <p className="post-body">{c.body}</p>
              <ResolveButtons targetKind="comment" targetId={c.id} authorId={c.authorId} />
            </div>
          ))}
        </>
      )}
      {queue.reports.length > 0 && (
        <>
          <h2 className="section">Open reports ({queue.reports.length})</h2>
          {queue.reports.map((r) => (
            <div key={r.id} className="card">
              <div className="meta">
                {r.targetKind} #{r.targetId} · reported by {r.reporterName} · {new Date(r.createdAt).toLocaleString()}
                {r.targetKind === "post" && <> · <Link href={`/post/${r.targetId}`}>view post</Link></>}
                {r.targetKind === "user" && <> · <Link href={`/u/${r.targetId}`}>view user</Link></>}
              </div>
              <p className="post-body">“{r.reason || "(no reason given)"}”</p>
              <ResolveButtons targetKind="report" targetId={r.id} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
