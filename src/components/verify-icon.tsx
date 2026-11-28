"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client";

export type PendingIcon = { iconId: number; iconUrl: string; expiresAt: string };

/**
 * Prove ownership of a claimed Riot link by setting an assigned League
 * profile icon. The server reads the account's current icon fresh on both
 * start and check — nothing here trusts a cached profile.
 */
export function VerifyIconButton({ puuid, pending: initialPending }: { puuid: string; pending: PendingIcon | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!initialPending);
  const [pending, setPending] = useState<PendingIcon | null>(initialPending);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function start() {
    if (busy) return;
    setBusy(true); setError(""); setNote("");
    try {
      const result = await postJson("/api/account/link-verification", { action: "start", puuid });
      if (!result.ok) { setError(result.data.error); return; }
      setPending({
        iconId: Number(result.data.iconId),
        iconUrl: String(result.data.iconUrl ?? ""),
        expiresAt: String(result.data.expiresAt ?? ""),
      });
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check your connection and try again.");
    } finally { setBusy(false); }
  }

  async function check() {
    if (busy) return;
    setBusy(true); setError(""); setNote("");
    try {
      const result = await postJson("/api/account/link-verification", { action: "check", puuid });
      if (result.ok) {
        setNote("Verified — this Riot account is proven yours.");
        setPending(null);
        router.refresh();
        return;
      }
      setError(result.data.error);
      if (result.status === 410 || result.status === 409) setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check your connection and try again.");
    } finally { setBusy(false); }
  }

  if (!open) {
    return <span>
      <button type="button" className="text-btn" disabled={busy} onClick={() => { setOpen(true); void start(); }}>
        {busy ? "Preparing…" : "Verify ownership"}
      </button>
      {error && <span role="alert" className="notice err" style={{ display: "block", marginTop: 6 }}>{error}</span>}
    </span>;
  }

  return (
    <div style={{ marginTop: 8 }}>
      {error && <p role="alert" className="notice err">{error}</p>}
      {note && <p role="status" className="notice ok">{note}</p>}
      {pending ? <>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {pending.iconUrl && <Image src={pending.iconUrl} alt="Assigned League profile icon" width={56} height={56} style={{ borderRadius: 10 }} />}
          <p className="meta" style={{ margin: 0 }}>
            Set this exact icon as your League profile icon (in the client: your profile → the icon),
            wait a minute for it to save, then check. You can switch back as soon as it verifies.
            The check stays open for 30 minutes.
          </p>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn small gold" disabled={busy} onClick={check}>
            {busy ? "Checking…" : "Check verification"}
          </button>
          <button type="button" className="text-btn" disabled={busy} onClick={start}>
            {busy ? "Working…" : "Get a different icon"}
          </button>
        </div>
      </> : !note && (
        <button type="button" className="btn small" disabled={busy} onClick={start}>
          {busy ? "Preparing…" : "Start verification"}
        </button>
      )}
    </div>
  );
}
