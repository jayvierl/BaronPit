"use client";
import { signInHref } from "@/lib/signin-return";
import { currentAppPath } from "@/lib/auth-draft";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { postJson } from "@/lib/client";
import { reportRules, type TargetKind } from "@/lib/safety-policy";

export function SafetyReport({ kind, targetId }: { kind: TargetKind; targetId: number }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const [error, setError] = useState(""),
    [guest, setGuest] = useState(false);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    const result = await postJson("/api/social/report", {
      kind,
      targetId,
      category: fields.get("category"),
      reason: fields.get("note"),
    });
    setBusy(false);
    if (result.ok) {
      setDone(true);
      setOpen(false);
    } else {
      setError(result.data.error);
      setGuest(result.status === 401);
    }
  }
  if (done)
    return (
      <span role="status">
        Report received. <Link href="/me/safety">Check outcome</Link>
      </span>
    );
  return (
    <div>
      {!open ? (
        <button type="button" className="text-btn" onClick={() => setOpen(true)}>
          Report
        </button>
      ) : (
        <form onSubmit={send} style={{ display: "grid", gap: 8 }}>
          <label>
            Report category{" "}
            <select name="category" defaultValue="" required>
              <option value="" disabled>
                Choose a reason
              </option>
              {Object.entries(reportRules).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Context (optional)
            <textarea
              name="note"
              maxLength={300}
              rows={2}
              placeholder="Leave out private details and sensitive files."
            />
          </label>
          <span>
            <button className="btn small" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send report"}
            </button>{" "}
            <button type="button" className="text-btn" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </span>
          {error && (
            <p role="alert">
              {error} {guest && <Link href={signInHref(currentAppPath())}>Sign in</Link>}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
