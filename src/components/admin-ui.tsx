"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { decisions, reportRules, type TargetKind, type Rule } from "@/lib/safety-policy";
import { postJson } from "@/lib/client";
import { useHydrated } from "./use-hydrated";

export function ReviewForm({
  kind,
  id,
  rule,
  releasable = true,
}: {
  kind: TargetKind | "appeal";
  id: number;
  rule: Rule;
  releasable?: boolean;
}) {
  const hydrated = useHydrated();
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || busy) return;
    const f = new FormData(event.currentTarget);
    if (f.get("action") === "ban" && !confirm("Permanently restrict this account?")) return;
    setBusy(true);
    setError("");
    const result = await postJson("/api/admin/resolve", {
      kind,
      id,
      action: f.get("action"),
      reason: f.get("reason"),
      rule: f.get("rule"),
    });
    if (result.ok) {
      if (result.data.pendingIndependentReview)
        setError("Recorded. A different designated responder must confirm release.");
      router.refresh();
    } else setError(result.data.error);
    setBusy(false);
  }
  return (
    <form method="post" onSubmit={decide} style={{ display: "grid", gap: 8 }}>
      {kind !== "appeal" && (
        <label>
          Applicable rule{" "}
          <select name="rule" defaultValue={rule}>
            {Object.entries(reportRules).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Decision{" "}
        <select required name="action" defaultValue="">
          <option value="" disabled>
            Choose a decision
          </option>
          {kind === "appeal" ? (
            <>
              <option value="uphold">Uphold</option>
              <option value="overturn">Overturn</option>
            </>
          ) : (
            Object.entries({ ...decisions, escalate: "Refer urgent rule to designated responders" })
              .filter(([v]) => releasable || v !== "dismiss")
              .map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))
          )}
        </select>
      </label>
      {kind === "appeal" && (
        <label>
          Reason sent to the appellant <textarea name="reason" maxLength={400} required />
        </label>
      )}
      <button type="submit" className="btn small" disabled={!hydrated || busy}>
        {busy ? "Saving…" : "Record decision"}
      </button>
      {error && <p role="alert">{error}</p>}
      <noscript><p>Enable JavaScript to record a moderation decision.</p></noscript>
    </form>
  );
}
export function AppealForm({ id }: { id: number }) {
  const hydrated = useHydrated();
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [done, setDone] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hydrated || busy || done) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await postJson("/api/social/appeal", { id, message: f.get("message") });
    setBusy(false);
    setMsg(r.ok ? "Appeal received for independent review." : r.data.error);
    if (r.ok) {
      setDone(true);
      router.refresh();
    }
  }
  return (
    <form method="post" onSubmit={submit}>
      <label>
        What should a second reviewer consider?
        <textarea disabled={done} required maxLength={600} name="message" />
      </label>
      <button className="btn small" type="submit" disabled={!hydrated || busy || done}>
        Submit appeal
      </button>
      <p role="status">{msg}</p>
      <noscript><p>Enable JavaScript to submit your appeal.</p></noscript>
    </form>
  );
}

export function RoomProtectionForm() {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hydrated || busy) return;
    const fields = new FormData(e.currentTarget);
    setBusy(true);
    const active = fields.get("action") === "start";
    const res = await postJson("/api/admin/room-protection", {
      slug: String(fields.get("slug")).trim().toLowerCase(),
      active,
    });
    setBusy(false);
    setMessage(
      res.ok ? (active ? "Incident mode enabled for 15 minutes." : "Incident mode ended.") : res.data.error,
    );
    if (res.ok) router.refresh();
  }
  return (
    <form method="post" onSubmit={update} style={{ display: "grid", gap: 8 }}>
      <label>
        Room slug <input required name="slug" placeholder="e.g. off-meta-lab" maxLength={90} />
      </label>
      <label>
        Incident control{" "}
        <select name="action">
          <option value="start">Start protection for 15 minutes</option>
          <option value="stop">End protection early</option>
        </select>
      </label>
      <button type="submit" disabled={!hydrated || busy} className="btn small">
        Update room
      </button>
      {message && <p role="status">{message}</p>}
      <noscript><p>Enable JavaScript to update room protection.</p></noscript>
    </form>
  );
}
