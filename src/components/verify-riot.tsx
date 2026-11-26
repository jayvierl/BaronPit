"use client";
import { useState } from "react";
import { postJson } from "@/lib/client";

export function VerifyRiotButton({puuid}:{puuid:string}) {
  const [busy,setBusy]=useState(false), [error,setError]=useState("");
  async function start() {
    setBusy(true);
    setError("");
    const result=await postJson("/api/account/riot/start",{puuid});
    if (result.ok && typeof result.data.href==="string" && result.data.href.startsWith("https://auth.riotgames.com/authorize?")) {
      window.location.assign(result.data.href);
      return;
    }
    setError(result.ok ? "Riot verification could not start." : result.data.error);
    setBusy(false);
  }
  return <div><button className="btn small secondary" type="button" onClick={start} disabled={busy}>
    {busy ? "Opening Riot…" : "Verify with Riot"}
  </button>{error && <p className="notice" role="alert">{error}</p>}</div>;
}
