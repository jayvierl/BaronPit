"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SCHEDULE_BLOCKS } from "@/lib/pure";
import type { LfgListing } from "@/lib/social";
import { Avatar } from "./ui";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && data.ok !== false, data };
}

const ROLES = ["Top", "Jungle", "Mid", "ADC", "Support", "Fill"];

export function LfgForm({ champs }: { champs: string[] }) {
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>([]);
  const [champText, setChampText] = useState("");
  const [playTimes, setPlayTimes] = useState("");
  const [blocks, setBlocks] = useState<string[]>([]);
  const [voice, setVoice] = useState(false);
  const [vibe, setVibe] = useState("both");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleRole = (r: string) => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r].slice(0, 3));

  const submit = async () => {
    setBusy(true); setMsg(null);
    const picked = champText.split(",").map((s) => s.trim()).filter(Boolean)
      .map((name) => champs.find((c) => c.toLowerCase() === name.toLowerCase()) ?? name).slice(0, 5);
    const { ok, data } = await postJson("/api/lfg", { roles, champs: picked, playTimes, voice, vibe, note, blocks });
    setBusy(false);
    if (!ok) { setMsg({ tone: "err", text: String(data.error ?? "Couldn't create the listing.") }); return; }
    setMsg({ tone: "ok", text: "Listing live for the next 4 hours. Your rank and form come straight from the API." });
    router.refresh();
  };

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Post a listing</h2>
      <p className="meta">Your linked Riot ID supplies the rank and recent form — nothing is self-reported. Listings expire in 4 hours.</p>
      <div className="field">
        <label>Roles you play</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ROLES.map((r) => (
            <button key={r} type="button" className={`kind-tab${roles.includes(r) ? " active" : ""}`} onClick={() => toggleRole(r)}>{r}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Champion pool (comma-separated)</label>
        <input type="text" placeholder="Ashe, Thresh, Lux" value={champText} onChange={(e) => setChampText(e.target.value)} />
      </div>
      <div className="field">
        <label>When do you play? (blocks power duo matching)</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {SCHEDULE_BLOCKS.map((b) => (
            <button key={b} type="button" className={`kind-tab${blocks.includes(b) ? " active" : ""}`}
              onClick={() => setBlocks(blocks.includes(b) ? blocks.filter((x) => x !== b) : [...blocks, b])}>{b}</button>
          ))}
        </div>
        <input type="text" placeholder="Anything specific — e.g. weeknights 7–11pm CT" value={playTimes} onChange={(e) => setPlayTimes(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontWeight: 600 }}>
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Voice chat
        </label>
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontWeight: 600 }}>
          Vibe
          <select className="inline" value={vibe} onChange={(e) => setVibe(e.target.value)}>
            <option value="chill">Chill</option>
            <option value="tryhard">Tryhard</option>
            <option value="both">Either</option>
          </select>
        </label>
      </div>
      <div className="field">
        <label>Note (keep contact in-app — no Discord handles)</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Support main looking for an ADC who plays late. We go next, no tilt." />
      </div>
      {msg && <div className={`notice ${msg.tone}`}>{msg.text}</div>}
      <button type="button" className="btn" disabled={busy} onClick={submit}>{busy ? "Posting…" : "Post listing"}</button>
    </div>
  );
}

/** The board: schedule-block filter + listing cards (#1 Duo Match by Schedule). */
export function LfgBoard({ listings, patch, signedIn }: { listings: LfgListing[]; patch: string; signedIn: boolean }) {
  const [mine, setMine] = useState<string[]>([]);
  const shown = mine.length === 0
    ? listings
    : listings.filter((l) => l.blocks.some((b) => mine.includes(b)));
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "4px 0 12px" }}>
        <span className="meta" style={{ marginRight: 2 }}>I play:</span>
        {SCHEDULE_BLOCKS.map((b) => (
          <button key={b} type="button" className={`kind-tab${mine.includes(b) ? " active" : ""}`}
            onClick={() => setMine(mine.includes(b) ? mine.filter((x) => x !== b) : [...mine, b])}>{b}</button>
        ))}
        {mine.length > 0 && <span className="meta">· {shown.length} overlapping listing{shown.length === 1 ? "" : "s"}</span>}
      </div>
      {shown.length === 0
        ? <div className="card empty">{listings.length === 0 ? "No open listings right now — be the first name on the board." : "Nobody overlaps those blocks right now — clear a filter or post your own listing."}</div>
        : shown.map((l) => (
          <div key={l.id} className="card">
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <Link href={`/u/${l.userId}`}><Avatar name={l.userName} hue={l.userHue} size={46} /></Link>
              <div style={{ flex: 1, minWidth: 220 }}>
                <Link href={`/u/${l.userId}`} style={{ fontWeight: 800, color: "var(--ink)" }}>{l.userName}</Link>
                <span className="flair">{l.rank}</span>
                <div className="meta">
                  <Link href={`/player?riotId=${encodeURIComponent(l.riotId)}`}>{l.riotId}</Link> · {l.recentForm} · {l.vibe === "both" ? "chill or tryhard" : l.vibe} · {l.voice ? "voice on" : "no voice"}
                  {l.playTimes && <> · 🕖 {l.playTimes}</>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7, alignItems: "center" }}>
                  {l.roles.map((r) => <span key={r} className="chip">{r}</span>)}
                  {l.blocks.map((b) => <span key={b} className="chip badge">{b}</span>)}
                  {l.champs.map((c) => (
                    <span key={c} className="chip" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                      <img src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${c}.png`} alt="" style={{ width: 18, height: 18, borderRadius: 4 }} /> {c}
                    </span>
                  ))}
                </div>
                {l.note && <p style={{ margin: "8px 0 0" }}>{l.note}</p>}
              </div>
              {signedIn && <WaveButton userId={l.userId} />}
            </div>
          </div>
        ))}
    </div>
  );
}

export function WaveButton({ userId }: { userId: number }) {
  const [waved, setWaved] = useState(false);
  return (
    <button type="button" className={`btn small${waved ? " secondary" : " gold"}`} disabled={waved}
      onClick={async () => {
        const { ok } = await postJson("/api/social/follow", { userId, follow: true });
        if (ok) setWaved(true);
      }}>
      {waved ? "Waved ✓ — add them in League" : "👋 Wave"}
    </button>
  );
}

export function CloseListingButton({ listingId }: { listingId: number }) {
  const router = useRouter();
  return (
    <button type="button" className="text-btn"
      onClick={async () => { await postJson("/api/lfg", { action: "close", listingId }); router.refresh(); }}>
      Close listing
    </button>
  );
}
