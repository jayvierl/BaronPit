"use client";

import { useEffect, useState } from "react";
import { safeReturnTo } from "@/lib/signin-return";
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
  useEffect(()=>{
    const raw = window.location.hash.slice(1);
    const controller = new AbortController();
    async function check() {
      if (!/^[a-f0-9]{64}$/.test(raw)) { setError("Open the complete link in your sign-in email."); return; }
      try {
        const res = await fetch("/api/auth/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"inspect",token:raw}),signal:controller.signal});
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.message || "Couldn’t check your link.");
        setInfo(data); setAgeBand(data.ageBand || ""); setToken(raw);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Check your connection and try again."); }
    }
    void check();
    return () => controller.abort();
  },[]);
  async function confirm(event:React.FormEvent) {
    event.preventDefault(); if (busy || !info) return;
    setBusy(true); setError("");
    try {
      const result = await postJson("/api/auth/verify",{token,action:"confirm",ageBand,accepted,termsVersion:TERMS_VERSION});
      if (!result.ok) throw new Error(result.data.error);
      window.location.replace(safeReturnTo(result.data.returnTo));
    } catch(e) { setError(e instanceof Error ? e.message : "Check your connection and try again."); setBusy(false); }
  }
  return <div className="card" style={{maxWidth:480,margin:"30px auto"}}><h1>Confirm sign-in</h1>
    {error && <p role="alert" className="notice err">{error}</p>}
    {!error && !info && <p role="status">Checking your link…</p>}
    {info && <form onSubmit={confirm}><p>Continue if you requested this email for your account.</p>
      {info.needsConsent && <><AgeField value={ageBand} onChange={setAgeBand} locked={!!info.ageBand}/>
        {isAgeBand(ageBand) && <TermsField checked={accepted} onChange={setAccepted}/>}</>}
      <button className="btn gold" disabled={busy || (info.needsConsent && (!isAgeBand(ageBand) || !accepted))}>{busy ? "Signing in…" : "Sign in to my account"}</button>
    </form>}
    <p><Link href="/signin">Request a fresh link</Link></p>
  </div>;
}
