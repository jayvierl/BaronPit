"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ENDORSE_KINDS } from "@/lib/pure";
import { playerStatsHref, splitRiotId } from "@/lib/platforms";
import { withSearchReturn } from "@/lib/search-scopes";
import { ActionFeedback, usePostAction } from "./post-action";
import { SafetyReport } from "./safety-report";
import { PlayerNameInput } from "./player-name-input";

export { CommentSection } from "./comment-section";
export { MatchCard } from "./match-card";
export { PostCard } from "./post-card";

function MembershipButton({ kind, id, initial }: { kind: "follow" | "join"; id: number; initial: boolean }) {
  const [active, setActive] = useState(initial);
  const action = usePostAction();
  const router = useRouter();
  const isFollow = kind === "follow";
  async function toggle() {
    const result = isFollow
      ? await action.send("/api/social/follow", { userId: id, follow: !active })
      : await action.send("/api/social/room-join", { roomId: id, join: !active });
    if (result && typeof result.active === "boolean") {
      setActive(result.active);
      router.refresh();
    }
  }
  const label = isFollow ? (active ? "Following" : "Follow") : active ? "Joined ✓" : "Join room";
  return (
    <span>
      <button
        type="button"
        aria-pressed={active}
        className={`btn small${active ? " secondary" : ""}`}
        disabled={action.busy}
        onClick={toggle}
      >
        {label}
      </button>
      <ActionFeedback error={action.error} />
    </span>
  );
}

export function FollowButton({ userId, initial }: { userId: number; initial: boolean }) {
  return <MembershipButton key={String(initial)} kind="follow" id={userId} initial={initial} />;
}

export function JoinButton({ roomId, initial }: { roomId: number; initial: boolean }) {
  return <MembershipButton key={String(initial)} kind="join" id={roomId} initial={initial} />;
}

export function EndorseRow({ userId }: { userId: number }) {
  const [done, setDone] = useState<string | null>(null);
  const action = usePostAction();
  const router = useRouter();
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {ENDORSE_KINDS.map((k) => (
        <button
          key={k.id}
          type="button"
          className="chip"
          disabled={action.busy || done !== null}
          onClick={async () => {
            if (await action.send("/api/social/endorse", { userId, kind: k.id })) {
              setDone(k.id);
              router.refresh();
            }
          }}
        >
          {k.label}
          {done === k.id ? " ✓" : ""}
        </button>
      ))}
      {done && <span role="status" className="meta">Endorsement added.</span>}
      <ActionFeedback error={action.error} />
    </div>
  );
}

export function UserSafetyMenu({ userId }: { userId: number }) {
  const action = usePostAction();
  const router = useRouter();
  const [notice, setNotice] = useState("");
  async function change(kind: "mute" | "block") {
    if (kind === "block" && !window.confirm("Block this player and remove your follows in both directions?"))
      return;
    if (await action.send("/api/social/" + kind, { userId, [kind]: true })) {
      setNotice(kind === "block" ? "Player blocked." : "Player muted.");
      router.refresh();
    }
  }
  return (
    <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      <button type="button" className="text-btn" disabled={action.busy} onClick={() => change("mute")}>
        Mute
      </button>
      <button type="button" className="text-btn" disabled={action.busy} onClick={() => change("block")}>
        Block
      </button>
      <SafetyReport kind="user" targetId={userId} />
      {notice && !action.error && (
        <span className="meta" role="status">
          {notice}
        </span>
      )}
      <ActionFeedback error={action.error} />
    </div>
  );
}

export function LookupForm({
  platforms,
  defaultPlatform = "na1",
  initialRiotId = "",
  searchReturn,
  playerReturn,
}: {
  platforms: { id: string; label: string }[];
  defaultPlatform?: string;
  initialRiotId?: string;
  searchReturn?: string;
  playerReturn?: string;
}) {
  const [riotId, setRiotId] = useState(initialRiotId);
  const [platform, setPlatform] = useState(defaultPlatform);
  const [error, setError] = useState("");
  const [lookingUp, startLookup] = useTransition();
  const router = useRouter();

  function openPlayer(id: string, server: string) {
    setError("");
    const path = withSearchReturn(playerStatsHref(server, id), searchReturn);
    startLookup(() => router.push(playerReturn ? `${path}&fromPlayer=${encodeURIComponent(playerReturn)}` : path));
  }

  return (
    <form
      className="lookup-form"
      action="/player"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const { gameName, tagLine } = splitRiotId(riotId, platform);
        if (!gameName || !tagLine) {
          setError("Enter the player’s Riot ID with its #tag.");
          return;
        }
        openPlayer(gameName + "#" + tagLine, platform);
      }}
    >
      {searchReturn && <input type="hidden" name="from" value={searchReturn} />}
      {playerReturn && <input type="hidden" name="fromPlayer" value={playerReturn} />}
      <PlayerNameInput
        name="riotId" label="Riot ID" scope="players" region={platform} value={riotId}
        onChange={value => {
          setRiotId(value);
          setError("");
        }}
        onSelect={suggestion => {
          if (suggestion.kind === "player") openPlayer(suggestion.riotId, suggestion.platform);
        }}
        placeholder={platform === "na1" ? "Player name or Name#TAG" : "Name#TAG"}
        required maxLength={50}
      />
      <select name="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Server">
        {platforms.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn gold" disabled={lookingUp}>
        {lookingUp ? "Looking up…" : "Look up"}
      </button>
      {platform === "na1" && (
        <small className="meta">Names use #NA1 by default. Include a custom tag if needed.</small>
      )}
      <ActionFeedback error={error} />
    </form>
  );
}

export function LinkPlayerButton({
  platform,
  gameName,
  tagLine,
}: {
  platform: string;
  gameName: string;
  tagLine: string;
}) {
  const router = useRouter();
  const action = usePostAction();
  const [done, setDone] = useState(false);
  return (
    <span>
      <button
        type="button"
        className="btn small"
        disabled={done || action.busy}
        onClick={async () => {
          if (await action.send("/api/account/link", { platform, gameName, tagLine })) {
            setDone(true);
            router.refresh();
          }
        }}
      >
        {done ? "Linked to profile ✓" : "Link this Riot ID"}
      </button>
      <ActionFeedback error={action.error} />
    </span>
  );
}
