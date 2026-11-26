"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionFeedback, usePostAction } from "./post-action";
import type { SafetyPlayer } from "@/lib/personal-safety";

type Setting = "block" | "mute";

export function PersonalSafetyControls({ kind, players }: { kind: Setting; players: SafetyPlayer[] }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState("");
  const isBlock = kind === "block";
  const title = isBlock ? "Blocked players" : "Muted players";

  function acknowledge(player: SafetyPlayer) {
    setMessage(isBlock ? `Unblocked ${player.name}.` : `Unmuted ${player.name}.`);
    heading.current?.focus();
    router.refresh();
  }

  return (
    <section className="card" aria-labelledby={`safety-${kind}-heading`}>
      <h3 id={`safety-${kind}-heading`} ref={heading} tabIndex={-1}>{title}</h3>
      <p>
        {isBlock
          ? "A block ends follows and Duo invitations. After you unblock someone, future interactions are possible if your other safety settings allow them."
          : "Muting hides this player’s activity and pauses Duo contact. Unmuting can make currently eligible Duo contact available again."}
      </p>
      <p className={message ? "notice ok" : undefined} role="status">{message}</p>
      {players.length ? (
        <ul style={{ paddingInlineStart: 0, listStyle: "none" }} role="list">
          {players.map(player => <SafetyPlayerRow key={player.id} kind={kind} player={player} onRemoved={acknowledge} />)}
        </ul>
      ) : <p className="meta">{isBlock ? "You have no blocked players." : "You have no muted players."}</p>}
    </section>
  );
}

function SafetyPlayerRow({ kind, player, onRemoved }: { kind: Setting; player: SafetyPlayer; onRemoved: (player: SafetyPlayer) => void }) {
  const action = usePostAction();
  const [removed, setRemoved] = useState(false);
  const label = kind === "block" ? "Unblock" : "Unmute";

  async function removeSetting() {
    if (await action.send(`/api/social/${kind}`, { userId: player.id, [kind]: false })) {
      setRemoved(true);
      onRemoved(player);
    }
  }

  return (
    <li className="match-row">
      <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
        <strong>{player.name}</strong>
        <ActionFeedback error={action.error} />
      </div>
      <button type="button" className="btn secondary" aria-label={`${label} ${player.name}`} disabled={action.busy || removed} onClick={removeSetting}>
        {label}
      </button>
    </li>
  );
}
