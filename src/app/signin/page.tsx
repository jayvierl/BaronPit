"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    params.get("error") === "expired" ? "error" : "idle",
  );
  const [message, setMessage] = useState(
    params.get("error") === "expired" ? "That link expired or was already used. Request a fresh one below." : "",
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    const res = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (j.ok) {
      setState("sent");
      setMessage("Check your inbox — your sign-in link is on its way. It expires in 15 minutes.");
    } else {
      setState("error");
      setMessage(j.message ?? "Something went wrong. Try again.");
    }
  };

  return (
    <div style={{ maxWidth: 460, margin: "30px auto" }}>
      <div className="card">
        <h1 style={{ margin: "0 0 6px", fontSize: 24 }}>Welcome to the party</h1>
        <p className="meta" style={{ marginTop: 0 }}>
          Passwordless sign-in: enter your email and we&apos;ll send a one-time link. New here? That same link creates your account.
        </p>
        {message && <div className={`notice ${state === "sent" ? "ok" : state === "error" ? "err" : "warn"}`}>{message}</div>}
        {state !== "sent" && (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <button type="submit" className="btn" disabled={state === "sending"} style={{ width: "100%", justifyContent: "center" }}>
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        )}
        <p className="meta" style={{ marginBottom: 0 }}>
          By signing in you agree to the <a href="/terms">Terms</a> and <a href="/guidelines">Community Guidelines</a>.
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
