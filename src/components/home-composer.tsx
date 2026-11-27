"use client";

import { useCallback, useRef, useState } from "react";
import type { AvatarIdentity } from "@/lib/author-identity";
import { POST_TO_THE_PIT } from "@/lib/brand";
import { Composer } from "./composer";
import { GuestPostDraft } from "./guest-draft";
import { Avatar } from "./ui";
import styles from "./home-composer.module.css";

function focusEditor(panel: HTMLDetailsElement) {
  const field = panel.querySelector("textarea");
  if (field && document.activeElement !== field) field.focus({ preventScroll: true });
}

export function HomeComposer({ viewerId, patch, champions, viewerIdentity }: {
  viewerId: number | null;
  patch: string;
  champions: string[];
  viewerIdentity: AvatarIdentity | null;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [draftOwner, setDraftOwner] = useState<number | null | undefined>(undefined);
  const onDraftChange = useCallback((hasDraft: boolean) => {
    setDraftOwner(hasDraft ? viewerId : undefined);
  }, [viewerId]);

  function close() {
    if (!details.current) return;
    details.current.open = false;
    trigger.current?.focus({ preventScroll: true });
    if (window.location.hash === "#compose") {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }

  // The editor keeps the fragment target so native navigation can reveal the disclosure.
  return (
    <details ref={details} className={styles.panel}
      onKeyDown={event => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing && details.current?.open &&
            (event.target === trigger.current || event.target === details.current.querySelector("textarea"))) {
          event.preventDefault();
          close();
        }
      }}>
      <summary className={styles.summary} ref={trigger} onClick={event => {
        const panel = details.current;
        if (!panel) return;
        event.preventDefault();
        if (panel.open) close();
        else {
          panel.open = true;
          focusEditor(panel);
        }
      }}>
        <span className={`${styles.avatar} ${styles.closed}`} aria-hidden="true">
          {viewerIdentity ? <Avatar {...viewerIdentity} size={40}/> : <span className={styles.guestAvatar}/>}
        </span>
        <span className={`${styles.prompt} ${styles.closed}`}>{draftOwner === viewerId ? "Continue draft" : POST_TO_THE_PIT}</span>
        <span className={`${styles.expand} ${styles.closed}`} aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" focusable="false">
            <path d="M8 3v10M3 8h10"/>
          </svg>
        </span>
        <span className={styles.open}>{POST_TO_THE_PIT}</span>
        <span className={`${styles.open} ${styles.close}`}>Close editor</span>
      </summary>
      {viewerId === null
        ? <GuestPostDraft key="guest" destination="/#compose" label="Your post" onDraftChange={onDraftChange}/>
        : <Composer key={viewerId} viewerId={viewerId} patch={patch} champions={champions} viewerIdentity={viewerIdentity}
            onDraftChange={onDraftChange}/>}
    </details>
  );
}
