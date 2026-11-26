"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DuoShortlistPlayer } from "@/lib/duo-shortlist";
import { ActionFeedback, usePostAction } from "./post-action";
import { Avatar } from "./ui";
import styles from "./duo-shortlist.module.css";

export function DuoPinButton({ playerId, initial, removeName, onRemoved }: {
  playerId: number; initial: boolean; removeName?: string; onRemoved?: () => void;
}) {
  const action = usePostAction();
  const [active, setActive] = useState(initial);

  async function toggle() {
    const result = await action.send("/api/social/duo-shortlist", { playerId, active: !active });
    if (typeof result?.active !== "boolean") return;
    setActive(result.active);
    if (!result.active) onRemoved?.();
  }

  return <span className={styles.control}>
    <button type="button" className={`btn small secondary ${styles.button}`}
      aria-pressed={removeName ? undefined : active} aria-label={removeName ? `Remove ${removeName} from Duo shortlist` : undefined}
      disabled={action.busy || (Boolean(removeName) && !active)} onClick={toggle}>
      {removeName ? "Remove" : "Pin for duos"}{active && !removeName && <span aria-hidden="true">✓</span>}
    </button>
    <ActionFeedback error={action.error}/>
  </span>;
}

export function DuoShortlist({ players, hasUnavailable }: { players: DuoShortlistPlayer[]; hasUnavailable: boolean }) {
  const router = useRouter();
  const clear = usePostAction();
  const heading = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState("");
  function confirmRemoval(text: string) {
    setMessage(text);
    heading.current?.focus();
    router.refresh();
  }

  return <section aria-labelledby="duo-shortlist-heading">
    <h2 id="duo-shortlist-heading" ref={heading} tabIndex={-1}>Duo shortlist</h2>
    <p className="meta">Only you can see your pins. Use the list to find community profiles again.</p>
    <p role="status" className={message ? "notice ok" : undefined}>{message}</p>
    {hasUnavailable && <div className={`list-row ${styles.row}`}>
      <p className="meta">Some pins are unavailable.</p>
      <div><button type="button" className={`btn small secondary ${styles.button}`} disabled={clear.busy} onClick={async () => {
        if (await clear.send("/api/social/duo-shortlist", { action: "clear-unavailable" })) {
          confirmRemoval("Unavailable pins were removed from your Duo shortlist.");
        }
      }}>Remove unavailable pins</button><ActionFeedback error={clear.error}/></div>
    </div>}
    {players.length ? <ul className={styles.list} role="list">
      {players.map(player => <li key={player.id} className={`list-row ${styles.row}`}>
        <Link href={`/u/${player.id}`} prefetch={false} className={styles.player}>
          <Avatar name={player.name} hue={player.hue} avatar={player.avatar} size={36}/>
          <strong>{player.name}</strong>
        </Link>
        <DuoPinButton playerId={player.id} initial removeName={player.name}
          onRemoved={() => confirmRemoval(`${player.name} was removed from your Duo shortlist.`)}/>
      </li>)}
    </ul> : <div className="empty">
      <p>Pin a player from their profile to keep them handy for your next duo.</p>
      <Link href="/search?scope=people">Find community players</Link>
    </div>}
    {players.length > 0 && <p><Link href="/lfg" prefetch={false}>Open Duo Finder</Link></p>}
  </section>;
}
