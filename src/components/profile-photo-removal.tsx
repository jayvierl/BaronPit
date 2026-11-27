"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useHydrated } from "./use-hydrated";

export function ProfilePhotoRemoval({ accountId }: { accountId: number }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const heading = useRef<HTMLHeadingElement>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function remove() {
    if (!hydrated || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/photo", {
        method: "DELETE", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        setError(typeof result?.error === "string" ? result.error : "Photo removal couldn’t be confirmed. Try again.");
        return;
      }
      if (disclosure.current) disclosure.current.open = false;
      setMessage("Your uploaded photos are no longer available to display or select.");
      heading.current?.focus();
      router.refresh();
    } catch {
      setError("Photo removal couldn’t be confirmed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (!disclosure.current) return;
    disclosure.current.open = false;
    disclosure.current.querySelector("summary")?.focus();
  }

  return <section className="card" id="uploaded-photos" aria-labelledby="uploaded-photos-heading">
    <h2 id="uploaded-photos-heading" tabIndex={-1} ref={heading}>Uploaded photos</h2>
    <p>Remove your uploaded profile photo and any uploads awaiting review. Safety evidence may be retained as explained in the <Link href="/privacy">privacy notice</Link>.</p>
    <details ref={disclosure}>
      <summary className="btn secondary">Delete uploaded photos</summary>
      <div className="profile-actions" role="group" aria-label="Confirm photo removal">
        <button type="button" className="btn" disabled={!hydrated || busy} onClick={() => void remove()}>{busy ? "Removing…" : "Remove uploaded photos"}</button>
        <button type="button" className="btn secondary" disabled={!hydrated || busy} onClick={close}>Keep photos</button>
      </div>
      <noscript><p>Enable JavaScript to remove your uploaded photos.</p></noscript>
    </details>
    {message && <p role="status">{message}</p>}
    {error && <p className="notice err" role="alert">{error}</p>}
  </section>;
}
