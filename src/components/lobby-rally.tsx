"use client";

import { useEffect, useState } from "react";
import { lobbyRallyAt, watchLobbyClock } from "@/lib/lobby-rally";

export function LobbyRally() {
  const [expanded, setExpanded] = useState(false);
  const [time, setTime] = useState<number | null>(null);
  useEffect(() => {
    if (expanded) return watchLobbyClock(setTime);
  }, [expanded]);

  const rally = time === null ? null : lobbyRallyAt(time);
  return (
    <details className="lobby-rally" onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>Lobby rally clock</summary>
      <p>The community lobby rallies for six seconds every six minutes.</p>
      {expanded && rally && <p className="lobby-rally-time" role="timer" aria-live="off">
        {rally.open ? "Rally open for " : "Next lobby rally in "}
        {Math.floor(rally.seconds / 60)}:{String(rally.seconds % 60).padStart(2, "0")}
      </p>}
    </details>
  );
}
