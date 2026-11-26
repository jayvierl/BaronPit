"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ENDORSE_KINDS } from "@/lib/pure";
import { splitRiotId } from "@/lib/platforms";
import { ActionFeedback, usePostAction } from "./post-action";
import { SafetyReport } from "./safety-report";

export { Composer } from "./composer";
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
  const [done, setDone] = useState<string[]>([]);
  const action = usePostAction();
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {ENDORSE_KINDS.map((k) => (
        <button
          key={k.id}
          type="button"
          className="chip"
          disabled={action.busy || done.includes(k.id)}
          onClick={async () => {
            if (await action.send("/api/social/endorse", { userId, kind: k.id }))
              setDone((current) => [...current, k.id]);
          }}
        >
          {k.label}
          {done.includes(k.id) ? " ✓" : ""}
        </button>
      ))}
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
}: {
  platforms: { id: string; label: string }[];
  defaultPlatform?: string;
  initialRiotId?: string;
}) {
  const [riotId, setRiotId] = useState(initialRiotId);
  const [platform, setPlatform] = useState(defaultPlatform);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      className="lookup-form"
      onSubmit={(e) => {
        e.preventDefault();
        const { gameName, tagLine } = splitRiotId(riotId, platform);
        if (!gameName || !tagLine) {
          setError("Enter the player’s Riot ID with its #tag.");
          return;
        }
        setError("");
        router.push("/player?" + new URLSearchParams({ platform, riotId: gameName + "#" + tagLine }));
      }}
    >
      <input
        value={riotId}
        onChange={(e) => {
          setRiotId(e.target.value);
          setError("");
        }}
        name="riotId"
        placeholder={platform === "na1" ? "Player name or Name#TAG" : "Name#TAG"}
        aria-label="Riot ID"
        required
        maxLength={50}
      />
      <select name="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Server">
        {platforms.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn gold">
        Look up
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

export function ShareCardButton({ puuid, match }: { puuid: string; match: { matchId: string } }) {
  const action = usePostAction();
  const router = useRouter();
  const [result, setResult] = useState("");
  return (
    <span>
      <button
        type="button"
        className="btn small gold"
        disabled={action.busy || !!result}
        onClick={async () => {
          const data = await action.sendDraft("/api/social/post", {
            kind: "card",
            body: "",
            data: { puuid, matchId: match.matchId },
          });
          if (!data) return;
          if (data.status === "held") {
            setResult("Awaiting review");
            return;
          }
          if (data.status !== "visible") { setResult("Submission received"); router.push("/me#submissions"); return; }
          setResult("Shared ✓");
          if (typeof data.postId === "number") router.push(`/post/${data.postId}`);
          else router.refresh();
        }}
      >
        {result || (action.busy ? "Sharing…" : "Share as card")}
      </button>
      <ActionFeedback error={action.error} />
    </span>
  );
}
