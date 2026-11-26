"use client";

import { useState } from "react";
import { copyableDraftText } from "@/lib/auth-draft";

export function DraftHelp({ destination }: { destination: string }) {
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");
  async function copy() {
    setManual("");
    try {
      const text = copyableDraftText(window.localStorage, destination);
      if (!text) {
        setMessage("The draft text is unavailable here. Check the browser where you started.");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        setMessage("Draft text copied. Paste it into the reply or question if you switch browsers.");
      } catch {
        setManual(text);
        setMessage("Select and copy your draft below.");
      }
    } catch {
      setMessage("Site storage is unavailable. Go back and copy your draft before opening your email.");
    }
  }
  if (destination.split(/[?#]/, 1)[0] === "/lfg") {
    return <p className="notice">Your duo preferences stay in this browser for 30 minutes. Open the email link here to bring them back, then save them to your account.</p>;
  }
  return (
    <aside className="notice">
      <p>Your draft stays in this browser for 30 minutes. Open the email link here to restore it. If your phone opens links in a different browser, copy your draft first.</p>
      <button type="button" className="text-btn" onClick={copy}>Copy draft text</button>
      {message && <p role="status">{message}</p>}
      {manual && <div className="field">
        <label htmlFor="manual-draft">Your draft text</label>
        <textarea id="manual-draft" readOnly rows={3} value={manual} onFocus={event => event.currentTarget.select()}/>
      </div>}
    </aside>
  );
}
