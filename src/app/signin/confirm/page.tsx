"use client";

import { useEffect, useState } from "react";
import { safeReturnTo, signInHref } from "@/lib/signin-return";
import { postJson } from "@/lib/client";
import Link from "next/link";
import { TERMS_VERSION, isAgeBand } from "@/lib/account-policy";
import { AgeField, TermsField } from "../declaration";

export default function ConfirmSignIn() {
  const [token,setToken] = useState("");
  const [info,setInfo] = useState<{needsConsent:boolean;ageBand:string|null} | null>(null);
  const [ageBand,setAgeBand] = useState("");
  const [accepted,setAccepted] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [returnTo,setReturnTo] = useState("/me");
  const [retryable,setRetryable] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    const raw = window.location.hash.slice(1);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    let active = true;
    async function check() {
      try {
        if (!/^[a-f0-9]{64}$/.test(raw)) { setError("Open the complete link in your sign-in email."); return; }
        const res = await fetch("/api/auth/verify", {
          method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"inspect",token:raw}),
          signal:controller.signal,
        });
        if (!active) return;
        if (res.status === 410) { setError("That link expired or was already used."); return; }
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || data?.ok !== true || typeof data.needsConsent !== "boolean") throw new Error("Link check failed");
        const band = isAgeBand(data.ageBand) ? data.ageBand : null;
        setInfo({ needsConsent: data.needsConsent, ageBand: band });
        setAgeBand(band ?? "");
        setReturnTo(safeReturnTo(data.returnTo));
        setToken(raw);
      } catch {
        if (!active) return;
        setError(controller.signal.aborted
          ? "Checking your link took too long. Try it again in this browser."
          : "We couldn’t check the link. Try it again in this browser.");
        setRetryable(true);
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void check();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  },[attempt]);
  async function confirm(event:React.FormEvent) {
    event.preventDefault(); if (busy || !info) return;
    setBusy(true); setError("");
    try {
      const result = await postJson("/api/auth/verify",{token,action:"confirm",ageBand,accepted,termsVersion:TERMS_VERSION});
      if (!result.ok) {
        if (result.status === 410) {
          setInfo(null);
          setError("That link is no longer valid. Request a fresh link to continue.");
        } else {
          if (result.status === 409) {
            setInfo(null);
            setAccepted(false);
            setRetryable(true);
          }
          setError(result.data.error);
        }
        setBusy(false);
        return;
      }
      window.location.replace(safeReturnTo(result.data.returnTo));
    } catch(e) { setError(e instanceof Error ? e.message : "Check your connection and try again."); setBusy(false); }
  }
  return <div className="card" style={{maxWidth:480,margin:"30px auto"}}><h1>Confirm sign-in</h1>
    {error && <p role="alert" className="notice err">{error}</p>}
    {!error && !info && <p role="status">Checking your link…</p>}
    {retryable && <button className="btn secondary" type="button" onClick={() => {
      setError("");
      setRetryable(false);
      setAttempt(n => n + 1);
    }}>Retry this link</button>}
    {info && <form method="post" onSubmit={confirm}><p>Continue if you requested this email for your account.</p>
      {info.needsConsent && <><AgeField value={ageBand} onChange={setAgeBand} locked={!!info.ageBand}/>
        {isAgeBand(ageBand) && <TermsField checked={accepted} onChange={setAccepted}/>}</>}
      <button className="btn gold" disabled={busy || (info.needsConsent && (!isAgeBand(ageBand) || !accepted))}>{busy ? "Signing in…" : "Sign in to my account"}</button>
    </form>}
    <noscript><p>Enable JavaScript to check and confirm your email link.</p></noscript>
    <p><Link href={returnTo === "/me" ? "/signin" : signInHref(returnTo)}>Request a fresh link</Link></p>
  </div>;
}
