"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client";

export function DuoGameCheckButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function check() {
    if (busy) return;
    setBusy(true);
    try {
      const { ok, data } = await postJson("/api/lfg/check-game", { id });
      setMessage(ok ? "Checked the latest available Riot snapshots." : String(data.error || "Please try again."));
      if (ok) router.refresh();
    } catch { setMessage("Couldn’t check that game. Try again shortly."); }
    finally { setBusy(false); }
  }
  return <><button className="btn secondary small" type="button" onClick={check} disabled={busy}>
    {busy ? "Checking…" : "Check our last game"}</button> <span role="status" className="meta">{message}</span></>;
}
