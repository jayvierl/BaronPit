"use client";

import { clearBrowserAuthDrafts } from "@/lib/auth-draft";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORMS, splitRiotId } from "@/lib/platforms";
import { usePostAction, ActionFeedback } from "./post-action";

export function ProfileForm({ name, bio }: { name: string; bio: string }) {
  const router = useRouter();
  const action = usePostAction();
  const [displayName, setDisplayName] = useState(name);
  const [bioText, setBioText] = useState(bio);
  const [saved, setSaved] = useState(false);
  const id = useId();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        if (await action.send("/api/account/profile", { displayName, bio: bioText })) {
          setSaved(true);
          router.refresh();
        }
      }}
    >
      <div className="field">
        <label htmlFor={id + "-name"}>Display name</label>
        <input
          id={id + "-name"}
          type="text"
          required
          value={displayName}
          disabled={action.busy}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setSaved(false);
          }}
          maxLength={40}
        />
      </div>
      <div className="field">
        <label htmlFor={id + "-bio"}>Bio</label>
        <textarea
          id={id + "-bio"}
          rows={3}
          value={bioText}
          disabled={action.busy}
          onChange={(e) => {
            setBioText(e.target.value);
            setSaved(false);
          }}
          maxLength={280}
          placeholder="Roles, champions or when you play…"
        />
      </div>
      <ActionFeedback error={action.error} />
      {saved && (
        <p className="notice ok" role="status">
          Profile saved.
        </p>
      )}
      <button type="submit" className="btn" disabled={action.busy}>
        {action.busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

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
        This link is a self-declared claim. Ownership verification requires Riot Sign On.{" "}
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
