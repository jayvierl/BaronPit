"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { beginDraftSignIn } from "@/lib/auth-draft";
import { signInHref } from "@/lib/signin-return";

export function GuestPostDraft({roomId, destination, label}: {roomId?: number; destination: string; label: string}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return <form id="compose" className="composer" onSubmit={event => {
    event.preventDefault();
    if (!body.trim()) { router.push(signInHref(destination)); return; }
    try {
      const href = beginDraftSignIn(window.localStorage, `post:${roomId ?? "home"}`, destination, {body});
      router.push(href);
    } catch { setError("This browser couldn’t save your draft. Copy it before signing in, or allow site storage and try again."); }
  }}>
    <label className="field" style={{ display: "grid", gap: 6 }}>
      <strong>{label}</strong>
      <textarea rows={2} placeholder="What’s on your mind?" maxLength={2000} value={body} onChange={event=>setBody(event.target.value)} />
    </label>
    {error && <p className="notice err" role="alert">{error}</p>}
    <div className="composer-foot">
      <small className="meta">Continue your draft here after signing in on this browser.</small>
      <button type="submit" className="btn small">Sign in to post</button>
    </div>
  </form>;
}
