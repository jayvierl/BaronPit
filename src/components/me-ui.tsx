"use client";

import { clearBrowserAuthDrafts } from "@/lib/auth-draft";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORMS, splitRiotId } from "@/lib/platforms";
import { usePostAction, ActionFeedback } from "./post-action";

export function LinkForm() {
  const router = useRouter();
  const action = usePostAction();
  const [riotId, setRiotId] = useState("");
  const [platform, setPlatform] = useState("na1");
  const [notice, setNotice] = useState("");
  const player = splitRiotId(riotId, platform);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setNotice("");
        if (!player.gameName || !player.tagLine) return;
        const result = await action.send("/api/account/link", { platform, ...player });
        if (result) {
          setNotice(`Linked ${result.riotId ?? riotId} to your profile.`);
          setRiotId("");
          router.refresh();
        }
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="inline"
          style={{ flex: "1 1 200px" }}
          aria-label="Riot ID to link"
          required
          value={riotId}
          disabled={action.busy}
          onChange={(e) => setRiotId(e.target.value)}
          placeholder={platform === "na1" ? "Player name or Name#TAG" : "Name#TAG"}
        />
        <select
          className="inline"
          aria-label="Server"
          value={platform}
          disabled={action.busy}
          onChange={(e) => setPlatform(e.target.value)}
        >
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn" disabled={action.busy || !player.gameName || !player.tagLine}>
          {action.busy ? "Linking…" : "Link Riot ID"}
        </button>
      </div>
      <ActionFeedback error={action.error} />
      {notice && (
        <p className="notice ok" role="status">
          {notice}
        </p>
      )}
      <p className="meta">
        This link starts as a self-declared claim. Prove it&apos;s yours with the profile-icon check under your linked IDs.{" "}
        {platform === "na1" && "Names without a tag use #NA1."}
      </p>
    </form>
  );
}

export function PrimaryPlayerButton({ puuid }: { puuid: string }) {
  const router = useRouter();
  const action = usePostAction();
  return <span>
    <button type="button" className="text-btn" disabled={action.busy} onClick={async () => {
      if (await action.send("/api/account/primary", { puuid })) router.refresh();
    }}>Use as primary</button>
    <ActionFeedback error={action.error} />
  </span>;
}

export function UnlinkButton({ puuid, label }: { puuid: string; label: string }) {
  const router = useRouter();
  const action = usePostAction();
  return (
    <span>
      <button
        type="button"
        className="text-btn"
        disabled={action.busy}
        onClick={async () => {
          if (window.confirm(`Unlink ${label}?`) && (await action.send("/api/account/unlink", { puuid })))
            router.refresh();
        }}
      >
        Unlink
      </button>
      <ActionFeedback error={action.error} />
    </span>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const action = usePostAction();
  return (
    <span>
      <button
        type="button"
        className="btn secondary"
        disabled={action.busy}
        onClick={async () => {
          if (await action.send("/api/auth/signout", {})) {
            clearBrowserAuthDrafts();
            router.replace("/");
            router.refresh();
          }
        }}
      >
        {action.busy ? "Signing out…" : "Sign out"}
      </button>
      <ActionFeedback error={action.error} />
    </span>
  );
}
