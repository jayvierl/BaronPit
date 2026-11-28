"use client";

import { useState } from "react";

/** Copies the exact public match link (the player page URL anchored to the
 * match). Mirrors ShareLink's clipboard behaviour: native feedback on
 * success, a selectable field when the clipboard is unavailable. */
export function CopyMatchLink({ path, className }: { path: string; className?: string }) {
  const [notice, setNotice] = useState("");
  const [manual, setManual] = useState("");

  async function copy() {
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const url = new URL(path, canonical?.href || window.location.origin).href;
    setNotice("");
    setManual("");
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied.");
    } catch {
      setManual(url);
    }
  }

  return <>
    <button type="button" className={className} onClick={copy}>Copy match link</button>
    {notice && <span role="status">{notice}</span>}
    {manual && <input readOnly value={manual} aria-label="Match link to copy" onFocus={event => event.target.select()} />}
  </>;
}
