"use client";
import { hasDraftContinuation } from "@/lib/auth-draft";
import { DraftHelp } from "./draft-help";
import { safeReturnTo } from "@/lib/signin-return";
import { postJson } from "@/lib/client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TERMS_VERSION, isAgeBand } from "@/lib/account-policy";
import { AgeField, TermsField } from "./declaration";

function SignInForm() {
  const params = useSearchParams();
  const router = useRouter();
  const returnTo = safeReturnTo(params.get("next"));
  const enrol = params.get("enrol") === "1";
  const [signup,setSignup] = useState(params.get("mode") === "signup");
  const [ageBand,setAgeBand] = useState("");
  const [accepted,setAccepted] = useState(false);
  const [email,setEmail] = useState("");
  const [busy,setBusy] = useState(false);
  const [sent,setSent] = useState(false);
  const [error,setError] = useState(params.get("error") === "expired" ? "That link expired. Request a fresh one." : "");
  async function submit(event:React.FormEvent) {
    event.preventDefault();
    if (busy || ((signup || enrol) && !isAgeBand(ageBand))) return;
    setBusy(true); setError("");
    try {
      const result = await postJson(enrol ? "/api/account/eligibility" : "/api/auth/request-link",
        enrol ? {ageBand,accepted,termsVersion:TERMS_VERSION} : {email,mode:signup ? "signup" : "signin",ageBand,next:returnTo});
      if (!result.ok) { setError(result.data.error); return; }
      if (enrol) { router.replace(returnTo); router.refresh(); return; }
      setSent(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <div style={{maxWidth:460,margin:"30px auto"}} className="card">
    <h1>{enrol ? "Community eligibility" : signup ? "Create your account" : "Sign in"}</h1>
    {!enrol && hasDraftContinuation(returnTo) && <DraftHelp destination={returnTo}/>}
    {error && <p role="alert" className="notice err">{error}</p>}
    {sent ? <><p role="status" className="notice ok">{signup ? "Check your inbox for a welcome link." : "If you have an account, check your inbox for your sign-in link."} Open it within 15 minutes.</p>
      <button className="text-btn" onClick={()=>{setSent(false);setError("");}}>Use another email or request a new link</button></> :
      <form onSubmit={submit}>
        {(signup || enrol) && <AgeField value={ageBand} onChange={setAgeBand}/>}
        {enrol && isAgeBand(ageBand) && <TermsField checked={accepted} onChange={setAccepted}/>}
        {!enrol && (!signup || isAgeBand(ageBand)) && <div className="field"><label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
        </div>}
        {(!(signup || enrol) || isAgeBand(ageBand)) && <button type="submit" className="btn gold" disabled={busy}>
          {busy ? "Working…" : enrol ? "Save and continue" : signup ? "Send my welcome link" : "Email me a sign-in link"}</button>}
      </form>}
    {!enrol && <p><button className="text-btn" type="button" disabled={busy} onClick={()=>{setSignup(!signup);setError("");setSent(false);}}>
      {signup ? "Already have an account? Sign in" : "New here? Create an account"}</button></p>}
  </div>;
}
export default function SignInPage() { return <Suspense><SignInForm/></Suspense>; }
