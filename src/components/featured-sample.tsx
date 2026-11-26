"use client";

import { useEffect, useState } from "react";
import { postJson } from "@/lib/client";

// In-memory and account-scoped. Closing or reloading this tab stops observation.
let sample: { user: number; first: number; expiresAt: number } | null = null;

export function FeaturedSample({
  userId,
  postId,
  source,
}: {
  userId: number;
  postId: number;
  source: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    let sent = false;
    function visible() {
      if (!sample || sent || document.visibilityState !== "visible") return;
      if (sample.user !== userId || sample.expiresAt <= Date.now()) {
        sample = null;
        return;
      }
      if (postId === sample.first) return;
      sent = true;
      void postJson("/api/pilot/featured", { action: "observe", postId, featuredId: sample.first });
    }
    visible();
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [userId, postId]);
  if (!source) return null;
  async function start() {
    if (busy) return;
    setBusy(true);
    const result = await postJson("/api/pilot/featured", { action: "start", postId, consent: true });
    setBusy(false);
    if (result.ok) {
      sample = { user: userId, first: postId, expiresAt: Date.now() + 30 * 60_000 };
      setJoined(true);
      setNotice("Your sample has started. Reload or close this tab to stop.");
    } else setNotice(result.data.error);
  }
  return (
    <section className="card">
      <h2>Help test the weekly matchup</h2>
      <p>
        For 30 minutes in this tab, count whether I open another discussion or post a new visible question. The
        pilot keeps the start time and two yes/no results. Participation is optional.
      </p>
      {!joined && (
        <button type="button" className="btn small" onClick={start} disabled={busy}>
          {busy ? "Saving…" : "Include my next steps"}
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
