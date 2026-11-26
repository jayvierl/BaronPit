"use client";

import { useState } from "react";
import { ThreadIcon } from "./thread-icon";

export function ShareLink({ path, kind }: { path: string; kind: "room" | "profile" | "thread" }) {
  const [notice, setNotice] = useState("");
  const [manual, setManual] = useState("");
  const label = `Share ${kind}`;

  async function share() {
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const url = new URL(path, canonical?.href || window.location.origin).href;
    setNotice("");
    setManual("");
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Link copied.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setManual(url);
    }
  }

  return <>
    <button type="button" className="action-btn" title={label} aria-label={label} onClick={share}><ThreadIcon name="share" /></button>
    {notice && <span className="meta" role="status">{notice}</span>}
    {manual && <input readOnly value={manual} aria-label={`${kind} link to copy`} onFocus={event => event.target.select()} />}
  </>;
}
