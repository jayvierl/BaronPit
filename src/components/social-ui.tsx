"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PostView, CommentView } from "@/lib/social";
import { samePatch } from "@/lib/pure";
import { upload } from "@vercel/blob/client";
import { Avatar, RichBody, timeAgo } from "./ui";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && data.ok !== false, data };
}

/* --------------------------------- Composer -------------------------------- */

type Kind = "text" | "build" | "poll" | "clip" | "media";

export function Composer({ roomId, patch, champions, userName, userHue }: {
  roomId?: number; patch: string; champions: string[]; userName?: string; userHue?: number;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("text");
  const [body, setBody] = useState("");
  const [champion, setChampion] = useState("");
  const [items, setItems] = useState<number[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [itemMap, setItemMap] = useState<Record<string, number>>({});
  const [runes, setRunes] = useState("");
  const [offMeta, setOffMeta] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [call, setCall] = useState(false);
  const [clipUrl, setClipUrl] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (kind !== "build" || Object.keys(itemMap).length) return;
    fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/item.json`)
      .then((r) => r.json())
      .then((j: { data: Record<string, { name: string }> }) => {
        const map: Record<string, number> = {};
        for (const [id, it] of Object.entries(j.data)) map[it.name] = Number(id);
        setItemMap(map);
      })
      .catch(() => {});
  }, [kind, patch, itemMap]);

  const submit = async () => {
    setBusy(true); setMsg(null);
    let data: Record<string, unknown> = {};
    if (kind === "build") data = { champion, items, runes, offMeta, patch };
    if (kind === "poll") data = { options: options.map((o) => o.trim()).filter(Boolean), ...(call ? { call: true } : {}) };
    if (kind === "clip") data = { url: clipUrl.trim() };
    if (kind === "media") {
      if (!mediaFile) { setBusy(false); setMsg({ tone: "err", text: "Choose a photo or a clip first." }); return; }
      const mediaType = mediaFile.type.startsWith("video/") ? "video" : "image";
      try {
        setUploading(true);
        const blob = await upload(mediaFile.name, mediaFile, {
          access: "public",
          handleUploadUrl: "/api/social/upload",
          clientPayload: JSON.stringify({ media: mediaType }),
        });
        data = { url: blob.url, mediaType };
      } catch (e) {
        setUploading(false); setBusy(false);
        setMsg({ tone: "err", text: e instanceof Error ? e.message : "Upload failed — try a smaller file." });
        return;
      }
      setUploading(false);
    }
    const { ok, data: res } = await postJson("/api/social/post", { kind, body, roomId: roomId ?? null, data });
    setBusy(false);
    if (!ok) { setMsg({ tone: "err", text: String(res.error ?? "Something went wrong.") }); return; }
    if (res.status === "held") {
      setMsg({ tone: "warn", text: "Posted — it's held for a quick moderator review before it appears. That's our anti-toxicity filter doing its job." });
    }
    setBody(""); setItems([]); setRunes(""); setOptions(["", ""]); setClipUrl("");
    setMediaFile(null); setMediaPreview("");
    router.refresh();
  };

  const itemNames = Object.keys(itemMap).filter((n) => n.toLowerCase().includes(itemQuery.toLowerCase())).slice(0, 8);

  return (
    <div className="composer" id="compose">
      <div className="composer-head">
        {userName != null && <Avatar name={userName} hue={userHue ?? 0} size={40} />}
        <textarea
          rows={2}
          placeholder={
            kind === "build" ? "Why does this build work? (the rationale is the good part)"
            : kind === "poll" ? "Ask the community a question…"
            : kind === "clip" ? "Say something about this clip…"
            : "Share a take, a build, a clip…"
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
        />
      </div>
      <div className="kind-tabs">
        {(["text", "build", "poll", "clip", "media"] as Kind[]).map((k) => (
          <button key={k} type="button" className={`kind-tab${kind === k ? " active" : ""}`} onClick={() => setKind(k)}>
            {k === "text" ? "Post" : k === "build" ? "Build" : k === "poll" ? "Poll" : k === "clip" ? "Clip" : "Media"}
          </button>
        ))}
      </div>
      {kind === "build" && (
        <div className="composer-extra" style={{ marginTop: 4 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="inline" list="wp-champs" placeholder="Champion" value={champion} onChange={(e) => setChampion(e.target.value)} style={{ flex: "1 1 150px" }} />
            <datalist id="wp-champs">{champions.map((c) => <option key={c} value={c} />)}</datalist>
            <input className="inline" placeholder="Runes (e.g. Conqueror · Triumph…)" value={runes} onChange={(e) => setRunes(e.target.value)} style={{ flex: "2 1 220px" }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input className="inline" placeholder="Search items to add (up to 6)" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} style={{ flex: 1 }} />
          </div>
          {itemQuery && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {itemNames.map((n) => (
                <button key={n} type="button" className="chip" onClick={() => { if (items.length < 6) setItems([...items, itemMap[n]]); setItemQuery(""); }}>{n}</button>
              ))}
            </div>
          )}
          <div className="build-items">
            {items.map((id, i) => (
              <img key={i} src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`} alt="" title="Click to remove"
                onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ cursor: "pointer" }} />
            ))}
          </div>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
            <input type="checkbox" checked={offMeta} onChange={(e) => setOffMeta(e.target.checked)} /> This is an off-meta build
          </label>
        </div>
      )}
      {kind === "poll" && (
        <div className="composer-extra" style={{ marginTop: 4, display: "grid", gap: 8 }}>
          {options.map((o, i) => (
            <input key={i} className="inline" placeholder={`Option ${i + 1}`} value={o} maxLength={60}
              onChange={(e) => { const next = [...options]; next[i] = e.target.value; setOptions(next); }} />
          ))}
          {options.length < 4 && (
            <button type="button" className="text-btn" onClick={() => setOptions([...options, ""])}>+ Add option</button>
          )}
          <button type="button" className="text-btn" style={call ? { color: "var(--accent-ink)", fontWeight: 700 } : undefined}
            onClick={() => {
              if (call) { setCall(false); return; }
              setCall(true);
              setOptions(["Baron", "Dragon", "Push the inhib", "Reset & farm"]);
            }}>
            {call ? "🟣 It's a Baron call — tap to undo" : "🟣 Make it a Baron call"}
          </button>
        </div>
      )}
      {kind === "clip" && (
        <div className="composer-extra" style={{ marginTop: 4 }}>
          <input className="inline" placeholder="YouTube / Twitch / Medal / Streamable link" value={clipUrl} onChange={(e) => setClipUrl(e.target.value)} style={{ width: "100%" }} />
          <p className="meta" style={{ margin: "6px 0 0" }}>Share the play from where it already lives — or upload it directly with the Media tab.</p>
        </div>
      )}
      {kind === "media" && (
        <div className="composer-extra" style={{ marginTop: 4 }}>
          {!mediaFile ? (
            <label className="btn secondary small" style={{ display: "inline-block", cursor: "pointer" }}>
              Choose a photo or clip
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setMediaFile(f);
                  setMediaPreview(f ? URL.createObjectURL(f) : "");
                }} />
            </label>
          ) : (
            <div>
              {mediaFile.type.startsWith("video/")
                ? <video className="media-video" src={mediaPreview} controls playsInline />
                : <img className="media-img" src={mediaPreview} alt="" />}
              <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center" }}>
                <span className="meta">{mediaFile.name} · {(mediaFile.size / 1024 / 1024).toFixed(1)} MB</span>
                <button type="button" className="text-btn" onClick={() => { setMediaFile(null); setMediaPreview(""); }}>Remove</button>
              </div>
            </div>
          )}
          <p className="meta" style={{ margin: "6px 0 0" }}>
            Photos up to 10 MB, clips up to 50 MB. Add a caption above if you want one.
            New accounts: media posts get a quick moderator review before they appear.
          </p>
        </div>
      )}
      {msg && <div className={`notice ${msg.tone}`} style={{ marginLeft: 52 }}>{msg.text}</div>}
      <div className="composer-foot">
        <span className="meta">Be kind — moderation is on. <a href="/guidelines">Guidelines</a></span>
        <button type="button" className="btn small" disabled={busy || (kind === "media" ? !mediaFile : !body.trim())} onClick={submit}>{uploading ? "Uploading…" : busy ? "Posting…" : "Post"}</button>
      </div>
    </div>
  );
}

/* --------------------------------- PostCard -------------------------------- */

export function PostCard({ post, patch, signedIn, viewerId }: { post: PostView; patch: string; signedIn: boolean; viewerId?: number | null }) {
  const router = useRouter();
  const [reactions, setReactions] = useState(post.reactions);
  const [mine, setMine] = useState<string[]>(post.myReactions);
  const [showComments, setShowComments] = useState(false);
  const [myVote, setMyVote] = useState(post.myVote);
  const [pollResults, setPollResults] = useState(post.pollResults);
  const [buildPatch, setBuildPatch] = useState<string | null>(typeof post.data.patch === "string" ? post.data.patch : null);

  const react = async (emoji: string) => {
    if (!signedIn) { router.push("/signin"); return; }
    const prevMine = mine;
    const prevReactions = reactions;
    const has = mine.includes(emoji);
    setMine(has ? mine.filter((e) => e !== emoji) : [...mine, emoji]);
    setReactions({ ...reactions, [emoji]: (reactions[emoji] ?? 0) + (has ? -1 : 1) });
    const { ok } = await postJson("/api/social/react", { kind: "post", targetId: post.id, emoji });
    if (!ok) { setMine(prevMine); setReactions(prevReactions); }
  };
  const vote = async (idx: number) => {
    if (!signedIn) { router.push("/signin"); return; }
    const prev = myVote;
    const prevResults = pollResults;
    setMyVote(idx);
    if (pollResults) {
      const next = [...pollResults];
      if (prev != null) next[prev] = Math.max(0, next[prev] - 1);
      next[idx] += 1;
      setPollResults(next);
    }
    const { ok } = await postJson("/api/social/vote", { postId: post.id, optionIdx: idx });
    if (!ok) { setMyVote(prev); setPollResults(prevResults); }
  };
  const report = async () => {
    if (!signedIn) { router.push("/signin"); return; }
    const reason = window.prompt("Report this post — what's wrong with it?");
    if (reason == null) return;
    await postJson("/api/social/report", { kind: "post", targetId: post.id, reason });
    window.alert("Thanks — a moderator will take a look. You'll see the outcome in your profile under Reports.");
  };

  const d = post.data as Record<string, unknown>;
  const pollTotal = pollResults?.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <article className="thread-post">
      <div className="thread-rail">
        <a href={`/u/${post.authorId}`}><Avatar name={post.authorName} hue={post.authorHue} size={40} /></a>
        {showComments && <span className="line" />}
      </div>
      <div className="thread-main">
        <div className="thread-head">
          <a className="post-author" href={`/u/${post.authorId}`}>{post.authorName}</a>
          {post.authorFlair && <span className="flair">{post.authorFlair}</span>}
          <span className="time">{timeAgo(post.createdAt)}</span>
          <button type="button" className="overflow-btn" onClick={report} title="More — report this post" aria-label="More options">···</button>
        </div>
        {(post.roomName || post.status === "held") && (
          <div className="meta">
            {post.roomName && <>in <a href={`/rooms/${post.roomSlug}`}>{post.roomName}</a></>}
            {post.status === "held" && <> · <strong>held for review</strong></>}
          </div>
        )}

        {post.kind === "build" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <img className="champ-icon" src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${String(d.champion ?? "")}.png`} alt="" />
              <div>
                <strong>{String(d.champion ?? "")} build</strong>
                <div className="meta">
                  Patch {buildPatch ?? patch}
                  {d.offMeta ? <> · <span className="offmeta">OFF-META</span></> : null}
                  {buildPatch && !samePatch(buildPatch, patch) && (
                    <>
                      {" "}· <span className="stale-tag">Outdated — unconfirmed for patch {patch.split(".").slice(0, 2).join(".")}</span>
                      {viewerId != null && viewerId === post.authorId && (
                        <button type="button" className="text-btn" style={{ marginLeft: 8, fontSize: 13 }}
                          onClick={async () => {
                            const { ok } = await postJson("/api/social/builds/reconfirm", { postId: post.id });
                            if (ok) setBuildPatch(patch);
                          }}>
                          Re-confirm for this patch
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="build-items">
              {((d.items as number[]) ?? []).map((id, i) => (
                <img key={i} src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`} alt="" />
              ))}
            </div>
            {d.runes ? <div className="meta" style={{ color: "var(--ink-mid)" }}>Runes: {String(d.runes)}</div> : null}
          </div>
        )}

        {post.body && <RichBody body={post.body} />}

        {post.kind === "poll" && Array.isArray(d.options) && (
          <div>
            {d.call === true && <div className="call-banner">🟣 The Call — the pit decides</div>}
            {(d.options as string[]).map((opt, i) => {
              const n = pollResults?.[i] ?? 0;
              const pct = pollTotal ? Math.round((n / pollTotal) * 100) : 0;
              return (
                <button key={i} type="button" className="poll-option" onClick={() => vote(i)}>
                  <span className="poll-fill" style={{ width: `${pct}%` }} />
                  <span>{opt}{myVote === i ? " ✓" : ""} — {n} vote{n === 1 ? "" : "s"} ({pct}%)</span>
                </button>
              );
            })}
          </div>
        )}

        {post.kind === "card" && (
          <MatchCard data={d} patch={patch} />
        )}

        {post.kind === "clip" && typeof d.url === "string" && <ClipEmbed url={d.url} />}
        {post.kind === "media" && typeof d.url === "string" && (
          d.mediaType === "video"
            ? <video className="media-video" src={d.url} controls playsInline preload="metadata" />
            : <img className="media-img" src={d.url} alt="" loading="lazy" />
        )}

        <div className="action-row">
          {["🔥", "❤️", "👏", "🎯", "GG"].map((e) => (
            <button key={e} type="button" className={`action-btn${mine.includes(e) ? " mine" : ""}`} onClick={() => react(e)} aria-label={`React ${e}`}>
              <span className="emoji">{e === "GG" ? null : e}</span>
              {e === "GG" && <span style={{ fontWeight: 700, fontSize: 13 }}>GG</span>}
              {(reactions[e] ?? 0) > 0 ? reactions[e] : ""}
            </button>
          ))}
          <button type="button" className="action-btn" onClick={() => setShowComments(!showComments)} aria-label="Replies">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5Z" />
            </svg>
            {post.commentCount > 0 ? post.commentCount : ""}
          </button>
          <a className="action-btn" href={`/post/${post.id}`} aria-label="Open post" style={{ marginLeft: "auto" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v13" />
              <path d="m7 10 5-5 5 5" />
              <path d="M4 21h16" />
            </svg>
          </a>
        </div>

        {showComments && <CommentSection postId={post.id} signedIn={signedIn} allowOneFix={post.kind === "card"} />}
      </div>
    </article>
  );
}

export function MatchCard({ data, patch }: { data: Record<string, unknown>; patch: string }) {
  const m = data.match as { champion: string; win: boolean; kills: number; deaths: number; assists: number; cs: number; items: number[]; baron?: boolean } | undefined;
  if (!m) return null;
  return (
    <div className={`match-card ${m.win ? "win" : "loss"}`}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <img className="champ-icon" src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${m.champion}.png`} alt="" />
        <div style={{ flex: 1 }}>
          <span className={m.win ? "win" : "loss"}>{m.win ? "Victory" : "Defeat"}</span>
          <span className="meta"> · {String(data.riotId ?? "")} on {m.champion}</span>
          {m.baron && <span className="baron-tag">🟣 Baron secured</span>}
          <div className="kda">{m.kills} / {m.deaths} / {m.assists} <span className="meta">· {m.cs} CS</span></div>
        </div>
        <div className="build-items" style={{ margin: 0 }}>
          {m.items.map((id, i) => <img key={i} src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`} alt="" style={{ width: 30, height: 30 }} />)}
        </div>
      </div>
    </div>
  );
}

function ClipEmbed({ url }: { url: string }) {
  let embed: string | null = null;
  try {
    const u = new URL(url);
    let id = "";
    if (u.hostname.includes("youtube.com")) {
      id = u.searchParams.get("v") ?? "";
      if (!id) {
        const m = u.pathname.match(/^\/(?:shorts|live)\/([\w-]{6,})/);
        if (m) id = m[1];
      }
    }
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    if (id) embed = `https://www.youtube.com/embed/${id}`;
  } catch { /* ignore */ }
  if (embed) {
    return (
      <div className="clip-frame">
        <iframe src={embed} width="100%" height="100%" style={{ border: 0 }} allowFullScreen title="Clip" loading="lazy" />
      </div>
    );
  }
  return <p style={{ marginTop: 8 }}><a href={url} target="_blank" rel="noreferrer">▶ Watch the clip</a></p>;
}

/* --------------------------------- Comments -------------------------------- */

export function CommentSection({ postId, signedIn, viewerName, viewerHue, allowOneFix }: {
  postId: number; signedIn: boolean; viewerName?: string; viewerHue?: number; allowOneFix?: boolean;
}) {
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [oneFix, setOneFix] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/social/comments?postId=${postId}`);
    const j = (await res.json()) as { comments: CommentView[] };
    setComments(j.comments ?? []);
  }, [postId]);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!signedIn) { window.location.href = "/signin"; return; }
    const { ok, data } = await postJson("/api/social/comments", { postId, body: draft, parentId: replyTo ?? undefined, oneFix: oneFix && !replyTo });
    if (!ok) { setMsg(String(data.error ?? "Couldn't post that.")); return; }
    if (data.status === "held") setMsg("Comment held for a quick moderator review.");
    setDraft(""); setReplyTo(null); setOneFix(false);
    void load();
  };

  const renderComment = (c: CommentView, depth: number): React.ReactNode => (
    <div key={c.id} style={{ marginLeft: depth * 24 }}>
      <div className="comment-row">
        <div className="comment-rail">
          <Avatar name={c.authorName} hue={c.authorHue} size={32} />
          {c.replies.length > 0 && <span className="line" />}
        </div>
        <div className="comment-main">
          <div>
            <strong style={{ fontSize: 14.5 }}>{c.authorName}</strong>{" "}
            <span className="time" style={{ fontSize: 13.5 }}>{timeAgo(c.createdAt)}</span>
          </div>
          <div style={{ fontSize: 15 }}>{c.oneFix && <span className="onefix-tag">One fix</span>}{c.body}</div>
          <button type="button" className="text-btn" style={{ padding: 0, fontSize: 13 }}
            onClick={() => { setReplyTo(c.id); inputRef.current?.focus(); }}>Reply</button>
        </div>
      </div>
      {c.replies.map((r) => renderComment(r, depth + 1))}
    </div>
  );

  return (
    <div className="comments">
      {comments == null ? <p className="meta">Loading…</p> : comments.length === 0 ? <p className="meta" style={{ marginTop: 12 }}>No replies yet — start the conversation.</p> : comments.map((c) => renderComment(c, 0))}
      {msg && <div className="notice warn">{msg}</div>}
      {allowOneFix && !replyTo && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className={`kind-tab${oneFix ? " active" : ""}`} onClick={() => setOneFix(!oneFix)}>
            🎯 One fix — suggest one thing to improve
          </button>
          {oneFix && <span className="meta" style={{ marginLeft: 8 }}>One thing, with the reason. Kindly.</span>}
        </div>
      )}
      <div className="reply-composer">
        {viewerName != null && <Avatar name={viewerName} hue={viewerHue ?? 0} size={32} />}
        <input ref={inputRef} placeholder={oneFix && !replyTo ? "One thing to fix…" : replyTo ? "Reply to the thread…" : "Add your reply…"}
          value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
        <button type="button" className="btn small" disabled={!draft.trim()} onClick={submit}>Reply</button>
      </div>
    </div>
  );
}

/* ------------------------------- small actions ------------------------------ */

export function FollowButton({ userId, initial }: { userId: number; initial: boolean }) {
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={`btn small${following ? " secondary" : ""}`} disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { ok } = await postJson("/api/social/follow", { userId, follow: !following });
        if (ok) setFollowing(!following);
        setBusy(false);
      }}>
      {following ? "Following" : "Follow"}
    </button>
  );
}

export function JoinButton({ roomId, initial }: { roomId: number; initial: boolean }) {
  const [joined, setJoined] = useState(initial);
  return (
    <button type="button" className={`btn small${joined ? " secondary" : ""}`}
      onClick={async () => {
        const { ok } = await postJson("/api/social/room-join", { roomId, join: !joined });
        if (ok) setJoined(!joined);
      }}>
      {joined ? "Joined ✓" : "Join room"}
    </button>
  );
}

export function EndorseRow({ userId }: { userId: number }) {
  const [done, setDone] = useState<string | null>(null);
  const kinds = [
    { id: "good_teammate", label: "🤝 Good teammate" },
    { id: "helpful", label: "🛠 Helpful builder" },
    { id: "shot_caller", label: "🎯 Shot caller" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {kinds.map((k) => (
        <button key={k.id} type="button" className="chip" disabled={done === k.id}
          onClick={async () => {
            const { ok, data } = await postJson("/api/social/endorse", { userId, kind: k.id });
            if (ok) setDone(k.id); else window.alert(String(data.error ?? "Couldn't endorse."));
          }}>
          {k.label}{done === k.id ? " ✓" : ""}
        </button>
      ))}
    </div>
  );
}

export function UserSafetyMenu({ userId }: { userId: number }) {
  const [state, setState] = useState("");
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button type="button" className="text-btn" onClick={async () => { await postJson("/api/social/mute", { userId, mute: true }); setState("Muted"); }}>Mute</button>
      <button type="button" className="text-btn" onClick={async () => {
        if (!window.confirm("Block this user? You won't see each other's posts, and follows are removed.")) return;
        await postJson("/api/social/block", { userId, block: true }); setState("Blocked"); window.location.reload();
      }}>Block</button>
      <button type="button" className="text-btn" onClick={async () => {
        const reason = window.prompt("Report this user — what's going on?");
        if (reason == null) return;
        await postJson("/api/social/report", { kind: "user", targetId: userId, reason }); setState("Reported");
      }}>Report</button>
      {state && <span className="meta">{state} ✓</span>}
    </span>
  );
}

export function LookupForm({ platforms, defaultPlatform = "na1" }: { platforms: { id: string; label: string }[]; defaultPlatform?: string }) {
  const router = useRouter();
  const [riotId, setRiotId] = useState("");
  const [platform, setPlatform] = useState(defaultPlatform);
  return (
    <form className="lookup-form" onSubmit={(e) => {
      e.preventDefault();
      const v = riotId.trim();
      if (!v) return;
      router.push(`/player?platform=${platform}&riotId=${encodeURIComponent(v)}`);
    }}>
      <input value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="Riot ID — e.g. Jay Lewis#NA1" aria-label="Riot ID" />
      <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
        {platforms.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <button type="submit" className="btn gold">Look up</button>
    </form>
  );
}

export function LinkPlayerButton({ platform, gameName, tagLine }: { platform: string; gameName: string; tagLine: string }) {
  const router = useRouter();
  const [state, setState] = useState("");
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button type="button" className="btn small" disabled={state === "done"}
        onClick={async () => {
          const { ok, data } = await postJson("/api/account/link", { platform, gameName, tagLine });
          if (ok) { setState("done"); router.refresh(); }
          else { setState(""); window.alert(String(data.error ?? "Couldn't link that player.")); }
        }}>
        {state === "done" ? "Linked ✓" : "Link this Riot ID to my account"}
      </button>
      {state === "done" && <span className="meta">Find it under your profile.</span>}
    </span>
  );
}

export function ShareCardButton({ puuid, platform, riotId, match }: {
  puuid: string; platform: string; riotId: string;
  match: { matchId: string; champion: string; win: boolean; kills: number; deaths: number; assists: number; cs: number; items: number[] };
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn small gold" disabled={done}
      onClick={async () => {
        const { ok, data } = await postJson("/api/social/post", {
          kind: "card", body: "", data: { puuid, platform, riotId, matchId: match.matchId, match },
        });
        if (ok) { setDone(true); router.push("/"); } else window.alert(String(data.error ?? "Sign in to share a game card."));
      }}>
      {done ? "Shared ✓" : "Share as card"}
    </button>
  );
}

/**
 * BaronTimer — a little living piece of the pit on the home page. Baron
 * respawns six minutes after it falls; this cycles on that same clock and
 * calls the group up when he's back. Pure theater, zero stakes.
 */
export function BaronTimer() {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setSecs(360 - (Math.floor(Date.now() / 1000) % 360));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  if (secs === null) return null;
  const up = secs > 354;
  const label = up
    ? "BARON IS UP — group up!"
    : `Next Baron in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} — be there with your team`;
  return (
    <span className="baron-timer" role="status">
      <span className="pulse-dot" />
      🟣 {label}
    </span>
  );
}
