"use client";

import { useState } from "react";

/** Copies the exact public match link (the player page URL anchored to the
 * match). Mirrors ShareLink's clipboard behaviour: native feedback on
 * success, a selectable field when the clipboard is unavailable. The label
 * is a prop only so the homepage example can name what its link actually
 * opens ("Copy example link"); match cards keep the default. */
export function CopyMatchLink({ path, className, label = "Copy match link" }: { path: string; className?: string; label?: string }) {
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
    <button type="button" className={className} onClick={copy}>{label}</button>
    {notice && <span role="status">{notice}</span>}
    {manual && <input readOnly value={manual} aria-label="Link to copy" onFocus={event => event.target.select()} />}
  </>;
}
