"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORMS } from "@/lib/platforms";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && data.ok !== false, data };
}

export function ProfileForm({ name, bio }: { name: string; bio: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [bioText, setBioText] = useState(bio);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  return (
    <div>
      <div className="field">
        <label>Display name</label>
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
      </div>
      <div className="field">
        <label>Bio</label>
        <textarea rows={3} value={bioText} onChange={(e) => setBioText(e.target.value)} maxLength={280} placeholder="Roles, champions, when you play, what you're climbing for…" />
      </div>
      {msg && <div className={`notice ${msg.tone}`}>{msg.text}</div>}
      <button type="button" className="btn" onClick={async () => {
        const { ok, data } = await postJson("/api/account/profile", { displayName, bio: bioText });
        if (ok) { setMsg({ tone: "ok", text: "Saved." }); router.refresh(); }
        else setMsg({ tone: "err", text: String(data.error ?? "Couldn't save.") });
      }}>Save profile</button>
    </div>
  );
}

export function LinkForm() {
  const router = useRouter();
  const [riotId, setRiotId] = useState("");
  const [platform, setPlatform] = useState("na1");
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="inline" style={{ flex: "1 1 200px" }} placeholder="Your Riot ID — Name#TAG" value={riotId} onChange={(e) => setRiotId(e.target.value)} />
        <select className="inline" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button type="button" className="btn" disabled={busy || !riotId.includes("#")} onClick={async () => {
          const hash = riotId.lastIndexOf("#");
          setBusy(true); setMsg(null);
          const { ok, data } = await postJson("/api/account/link", {
            platform, gameName: riotId.slice(0, hash).trim(), tagLine: riotId.slice(hash + 1).trim(),
          });
          setBusy(false);
          if (ok) { setMsg({ tone: "ok", text: `Linked ${String(data.riotId ?? riotId)} — and auto-joined your top champions' rooms.` }); setRiotId(""); router.refresh(); }
          else setMsg({ tone: "err", text: String(data.error ?? "Couldn't link that Riot ID.") });
        }}>{busy ? "Linking…" : "Link Riot ID"}</button>
      </div>
      {msg && <div className={`notice ${msg.tone}`}>{msg.text}</div>}
      <p className="meta">
        Linking is claim-based for now: it powers your flair, rooms, and LFG rank. Fully verified ownership arrives
        with Riot Sign On once Riot approves our production application.
      </p>
    </div>
  );
}

export function UnlinkButton({ puuid, label }: { puuid: string; label: string }) {
  const router = useRouter();
  return (
    <button type="button" className="text-btn" onClick={async () => {
      if (!window.confirm(`Unlink ${label}?`)) return;
      await postJson("/api/account/unlink", { puuid });
      router.refresh();
    }}>Unlink</button>
  );
}

export function SignOutButton() {
  return (
    <button type="button" className="btn secondary" onClick={async () => {
      await fetch("/api/auth/signout", { method: "POST" });
      window.location.href = "/";
    }}>Sign out</button>
  );
}
