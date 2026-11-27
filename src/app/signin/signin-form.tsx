"use client";
import { hasDraftContinuation } from "@/lib/auth-draft";
import { DraftHelp } from "./draft-help";
import { postJson } from "@/lib/client";
import { useHydrated } from "@/components/use-hydrated";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TERMS_VERSION, isAgeBand, type AgeBand } from "@/lib/account-policy";
import { AgeField, TermsField } from "./declaration";
import styles from "./signin.module.css";

export function SignInForm({ returnTo, enrol, initialSignup, expired, accountId, knownAgeBand = null }: {
  returnTo: string; enrol: boolean; initialSignup: boolean; expired: boolean; accountId?: number; knownAgeBand?: AgeBand | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const path = returnTo.split(/[?#]/, 1)[0];
  const purpose = path === "/lfg" ? "Sign in to return to Duo Finder with your choices."
    : path === "/profile/edit" ? "Your link will take you back to the profile editor."
    : path.startsWith("/u/") ? "Your link will take you back to this community profile."
    : path.startsWith("/rooms/") ? "Your link will take you back to this room."
    : path.startsWith("/post/") ? "Your link will take you back to this discussion."
    : "We’ll email you a one-time link. No password needed.";
  const [signup,setSignup] = useState(initialSignup);
  const [ageBand,setAgeBand] = useState<string>(knownAgeBand ?? "");
  const [accepted,setAccepted] = useState(false);
  const [email,setEmail] = useState("");
  const [busy,setBusy] = useState(false);
  const [sent,setSent] = useState(false);
  const [error,setError] = useState(expired ? "That link expired. Request a fresh one." : "");
  async function submit(event:React.FormEvent) {
    event.preventDefault();
    if (!hydrated || busy || ((signup || enrol) && !isAgeBand(ageBand)) || (enrol && !accepted)) return;
    setBusy(true); setError("");
    try {
      const result = await postJson(enrol ? "/api/account/eligibility" : "/api/auth/request-link",
        enrol ? {accountId,ageBand,accepted,termsVersion:TERMS_VERSION} : {email,mode:signup ? "signup" : "signin",ageBand,next:returnTo});
      if (!result.ok) { setError(result.data.error); return; }
      if (enrol) { router.replace(returnTo); router.refresh(); return; }
      setSent(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <div className={styles.sheet}>
    <h1>{enrol ? "Community eligibility" : signup ? "Create your account" : "Sign in"}</h1>
    {!enrol && !sent && <p className={styles.purpose}>{purpose}</p>}
    {!enrol && hasDraftContinuation(returnTo) && <DraftHelp destination={returnTo}/>}
    {error && <p role="alert" className="notice err">{error}</p>}
    {sent ? <><p role="status" className="notice ok">{signup ? "Check your inbox for a welcome link." : "If you have an account, check your inbox for your sign-in link."} Open it within 15 minutes.</p>
      <button className="text-btn" onClick={()=>{setSent(false);setError("");}}>Use another email or request a new link</button></> :
      <form method="post" onSubmit={submit}>
        {(signup || enrol) && <AgeField value={ageBand} onChange={setAgeBand} locked={enrol && !!knownAgeBand}/>}
        {enrol && isAgeBand(ageBand) && <TermsField checked={accepted} onChange={setAccepted}/>}
        {!enrol && (!signup || isAgeBand(ageBand)) && <div className="field"><label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
        </div>}
        {(!(signup || enrol) || isAgeBand(ageBand)) && <button type="submit" className="btn gold" disabled={!hydrated || busy || (enrol && !accepted)}>
          {busy ? "Working…" : enrol ? "Save and continue" : signup ? "Send my welcome link" : "Email me a sign-in link"}</button>}
      </form>}
    <noscript><p>Enable JavaScript to {enrol ? "confirm community eligibility" : "request an email link"}.</p></noscript>
    {!enrol && <p><button className="text-btn" type="button" disabled={!hydrated || busy} onClick={()=>{setSignup(!signup);setError("");setSent(false);}}>
      {signup ? "Already have an account? Sign in" : "New here? Create an account"}</button></p>}
  </div>;
}
