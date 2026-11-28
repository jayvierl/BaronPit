"use client";

import { useState } from "react";
import { postJson } from "@/lib/client";
import { safeReturnTo } from "@/lib/signin-return";
import { TERMS_VERSION, isAgeBand } from "@/lib/account-policy";
import { AgeField, TermsField } from "./declaration";

/**
 * The stay-in-this-browser alternative to the emailed link: email + the
 * 6-digit code from the same message. Mirrors the link confirm page — inspect
 * first (which validates the code), then confirm with consent when required.
 */
export function CodeSignInForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);
  const [knownBand, setKnownBand] = useState<string | null>(null);
  const [ageBand, setAgeBand] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm(band: string, termsAccepted: boolean) {
    const result = await postJson("/api/auth/verify-code", {
      action: "confirm", email, code, ageBand: band, accepted: termsAccepted, termsVersion: TERMS_VERSION,
    });
    if (!result.ok) {
      if (result.status === 409) {
        // Consent state changed since inspect; ask again on this form.
        setNeedsConsent(true);
        setAccepted(false);
      }
      setError(result.data.error);
      return;
    }
    window.location.replace(safeReturnTo(typeof result.data.returnTo === "string" ? result.data.returnTo : "/me"));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (needsConsent === null) {
        const info = await postJson("/api/auth/verify-code", { action: "inspect", email, code });
        if (!info.ok) { setError(info.data.error); return; }
        const band = typeof info.data.ageBand === "string" && isAgeBand(info.data.ageBand) ? info.data.ageBand : null;
        if (info.data.needsConsent !== true) {
          await confirm(band ?? "", false);
          return;
        }
        setKnownBand(band);
        setAgeBand(band ?? "");
        setNeedsConsent(true);
        return;
      }
      await confirm(ageBand, accepted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit}>
      {error && <p role="alert" className="notice err">{error}</p>}
      {needsConsent === null ? (
        <>
          <div className="field">
            <label htmlFor="signin-code-email">Email address</label>
            <input id="signin-code-email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label htmlFor="signin-code">6-digit code from the email</label>
            <input id="signin-code" type="text" inputMode="numeric" autoComplete="one-time-code" required
              pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456" style={{ letterSpacing: 4 }} />
          </div>
          <button type="submit" className="btn gold" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Sign in with code"}
          </button>
        </>
      ) : (
        <>
          <p>One more step for this account: confirm your age group and the community terms.</p>
          <AgeField value={ageBand} onChange={setAgeBand} locked={!!knownBand} />
          {isAgeBand(ageBand) && <TermsField checked={accepted} onChange={setAccepted} />}
          <button type="submit" className="btn gold" disabled={busy || !isAgeBand(ageBand) || !accepted}>
            {busy ? "Signing in…" : "Confirm and sign in"}
          </button>
        </>
      )}
    </form>
  );
}
