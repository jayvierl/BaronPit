"use client";
import { useState } from "react";
import { duoFitReasons, type DuoFit } from "@/lib/duo-fit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SCHEDULE_BLOCKS } from "@/lib/pure";
import { DUO_ROLES } from "@/lib/pure";
import type { DuoListing, DuoRequest } from "@/lib/duo";
import { postJson } from "@/lib/client";
import { SafetyReport } from "./safety-report";

function toggled(selected: string[], value: string) {
  return selected.includes(value) ? selected.filter((r) => r !== value) : [...selected, value];
}
function DuoButton({ action, id, children }: { action: string; id: number; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const router = useRouter();
  async function submit() {
    setBusy(true);
    setResult("");
    try {
      const { ok, data } = await postJson("/api/lfg", { action, id });
      if (ok) {
        setResult("Saved.");
        router.refresh();
      } else setResult(String(data.error ?? "Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button type="button" className="btn small secondary" disabled={busy} onClick={submit}>
        {busy ? "Saving…" : children}
      </button>
      {result && (
        <span role="status" className="meta">
          {" "}
          {result}
        </span>
      )}
    </span>
  );
}
export function LfgForm({ fit }: { fit: DuoFit | null }) {
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>(fit ? [fit.role] : []),
    [blocks, setBlocks] = useState<string[]>(fit?.blocks ?? []);
  // Voice on a listing is about this player. A partner preference never opts the player into voice.
  const [voice, setVoice] = useState(false),
    [vibe, setVibe] = useState<string>(fit?.vibe ?? "both"),
    [note, setNote] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { ok, data } = await postJson("/api/lfg", { action: "create", roles, blocks, voice, vibe, note });
      if (ok) {
        setMessage(data.held ? "Your listing is in review." : "Your listing is open for four hours.");
        setNote("");
        router.refresh();
      } else setMessage(String(data.error ?? "Couldn’t publish that listing."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card" onSubmit={publish}>
      <h2>Post a listing</h2>
      <div className="field" role="group" aria-label="Roles">
        <strong>Choose up to three roles</strong>
        <div className="duo-controls">
          {DUO_ROLES.map((r) => (
            <button
              type="button"
              key={r}
              aria-pressed={roles.includes(r)}
              disabled={!roles.includes(r) && roles.length >= 3}
              className={`kind-tab${roles.includes(r) ? " active" : ""}`}
              onClick={() => setRoles(toggled(roles, r))}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="field" role="group" aria-label="Play times">
        <strong>When do you play?</strong>
        <div className="duo-controls">
          {SCHEDULE_BLOCKS.map((b) => (
            <button
              type="button"
              key={b}
              aria-pressed={blocks.includes(b)}
              className={`kind-tab${blocks.includes(b) ? " active" : ""}`}
              onClick={() => setBlocks(toggled(blocks, b))}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        Playstyle
        <select value={vibe} onChange={(e) => setVibe(e.target.value)}>
          <option value="both">Flexible</option>
          <option value="chill">Chill</option>
          <option value="tryhard">Competitive</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Open to voice
        chat
      </label>
      <label className="field">
        Game plan
        <textarea
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Looking to practise bot-lane trades"
        />
      </label>
      <p className="meta">Use the in-app request. Keep account details and contact handles private.</p>
      <button className="btn" disabled={busy || !roles.length || !blocks.length}>
        {busy ? "Posting…" : "Post listing"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
export function LfgBoard({ listings, requests, fit, onlyFit }: {
  listings: DuoListing[]; requests: DuoRequest[]; fit: DuoFit | null; onlyFit: boolean;
}) {
  const [filter, setFilter] = useState<string[]>([]);
  const displayed = listings.filter(
    (l) => l.own || !filter.length || l.blocks.some((b) => filter.includes(b)),
  );
  return (
    <>
      {!!requests.length && (
        <section>
          <h2>Your duo requests</h2>
          {requests.map((r) => (
            <article className="card" key={r.id}>
              <strong>
                {r.status === "accepted" ? "Matched" : r.incoming ? "Incoming request" : "Request sent"}
              </strong>
              <p>
                {r.rank} · {r.platform}
              </p>
              {r.requeue && (
                <div>
                  <p>
                    <strong>Play together again</strong>
                    {r.matchedAt && (
                      <span className="meta">
                        {" "}
                        · Connected{" "}
                        {new Date(r.matchedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZoneName: "short",
                          timeZone: "UTC",
                        })}
                      </span>
                    )}
                  </p>
                  <p>
                    {r.requeue === "mutual"
                      ? "Both of you want another game."
                      : r.requeue === "waiting"
                        ? "Your choice is private until you both opt in."
                        : "You played together after matching. Your choice stays private until you both say yes."}
                  </p>
                  <DuoButton id={r.id} action={r.requeue === "available" ? "requeue" : "withdraw-requeue"}>
                    {r.requeue === "available" ? "I'd queue again" : "Withdraw my choice"}
                  </DuoButton>
                </div>
              )}
              {r.thanks && (
                <section aria-label="Post-game appreciation">
                  {r.thanks.received && <p>Your duo thanked you for the game.</p>}
                  {r.thanks.sent ? <p>You sent your duo a private thank-you.</p> : r.thanks.canSend && (
                    <DuoButton id={r.id} action="thank">Send a free thank-you</DuoButton>
                  )}
                  {r.thanks.adultPair && <p className="meta"><Link href="/lfg/thanks">See how a future tip could be split</Link></p>}
                </section>
              )}
              {r.riotId && (
                <p>
                  Both players agreed to connect. Add <strong>{r.riotId}</strong> in League.
                </p>
              )}
              <div className="duo-controls">
                {r.status === "pending" && r.incoming && (
                  <DuoButton action="accept" id={r.id}>
                    Accept and share Riot IDs
                  </DuoButton>
                )}
                {r.status === "pending" && (
                  <DuoButton action="decline" id={r.id}>
                    {r.incoming ? "Decline" : "Withdraw"}
                  </DuoButton>
                )}
                <DuoButton action="block-request" id={r.id}>
                  Block player
                </DuoButton>
                <SafetyReport kind="duo_request" targetId={r.id} />
              </div>
            </article>
          ))}
        </section>
      )}
      <h2 id="open-listings">Open listings</h2>
      <nav className="duo-list-views" aria-label="Open listing views">
        {fit && <Link href="/lfg?view=fit#open-listings" aria-current={onlyFit ? "page" : undefined}>Matches my plan</Link>}
        <Link href="/lfg?view=all#open-listings" aria-current={!onlyFit || !fit ? "page" : undefined}>All eligible listings</Link>
        <Link href="#duo-plan">{fit ? "Edit my plan" : "Set my preferences"}</Link>
      </nav>
      <p className="meta">Listings show each player’s local play times. Confirm the time zone after connecting.</p>
      <div role="group" className="duo-controls" aria-label="Filter by play time">
        {SCHEDULE_BLOCKS.map((b) => (
          <button
            key={b}
            type="button"
            className={`kind-tab${filter.includes(b) ? " active" : ""}`}
            aria-pressed={filter.includes(b)}
            onClick={() => setFilter(toggled(filter, b))}
          >
            {b}
          </button>
        ))}
      </div>
      {!displayed.some(listing => !listing.own) && (
        <p className="empty">
          {listings.some(listing => !listing.own)
            ? "No other listings match these times."
            : fit && onlyFit ? "No listings match your plan yet. Try all eligible listings or edit your preferences."
              : "No open listings for your region and age group yet."}
        </p>
      )}
      {displayed.map((l) => (
        <article key={l.id} className="card">
          <strong>{l.own ? (l.held ? "Your listing is in review" : "Your listing") : l.rank}</strong>
          <p>
            {l.roles.join(" / ")} · {l.platform} · {l.form}
          </p>
          <p>
            {l.blocks.join(" · ")} · {l.voice ? "Open to voice" : "Text only"} ·{" "}
            {l.vibe === "both" ? "Flexible" : l.vibe === "tryhard" ? "Competitive" : "Chill"}
          </p>
          {fit && !l.own && <FitReasons fit={fit} listing={l} />}
          {!!l.champs.length && <p>Recent champions · {l.champs.join(", ")}</p>}
          {l.note && <p>{l.note}</p>}
          {l.own ? (
            <DuoButton action="close" id={l.id}>
              Close listing
            </DuoButton>
          ) : (
            <div className="duo-controls">
              {l.requested ? (
                <span className="meta">Request already sent</span>
              ) : (
                <DuoButton action="request" id={l.id}>
                  Request a duo
                </DuoButton>
              )}
              <DuoButton action="block-listing" id={l.id}>
                Block player
              </DuoButton>
              <SafetyReport kind="lfg" targetId={l.id} />
            </div>
          )}
        </article>
      ))}
    </>
  );
}

function FitReasons({ fit, listing }: { fit: DuoFit; listing: DuoListing }) {
  const reasons = duoFitReasons(fit, listing);
  return reasons.length ? <p className="duo-reasons"><strong>Shared preferences</strong> · {reasons.join(" · ")}</p> : null;
}
