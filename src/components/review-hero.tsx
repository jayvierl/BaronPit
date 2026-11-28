"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { playerStatsHref, splitRiotId } from "@/lib/platforms";
import { PlayerNameInput } from "./player-name-input";
import { ActionFeedback } from "./post-action";
import styles from "./review-hero.module.css";

/** Homepage hero for "Review your last game". The lookup is the existing
 * player lookup — same Riot ID validation, regions and suggestions as the
 * Player Stats search — with one difference in destination: it carries
 * `review=1`, so the player page routes the visitor to their latest
 * completed ranked match instead of a generic profile landing. The form
 * still works without JavaScript (a plain GET to /player), and nothing here
 * asks a guest to sign up: the review itself is public. */
export function ReviewHero({
  platforms,
  children,
}: {
  platforms: { id: string; label: string }[];
  children?: ReactNode;
}) {
  const [riotId, setRiotId] = useState("");
  const [platform, setPlatform] = useState("na1");
  const [error, setError] = useState("");
  const [exampleOpen, setExampleOpen] = useState(false);
  const [lookingUp, startLookup] = useTransition();
  const router = useRouter();

  function openReview(id: string, server: string) {
    setError("");
    startLookup(() => router.push(`${playerStatsHref(server, id)}&review=1`));
  }

  return (
    <section className={styles.hero} aria-labelledby="review-hero-title">
      <svg className={styles.contours} aria-hidden="true" viewBox="0 0 400 300" preserveAspectRatio="xMaxYMin slice">
        {[46, 92, 138, 184, 230, 276].map(radius => (
          <circle key={radius} cx="400" cy="0" r={radius} fill="none" />
        ))}
      </svg>
      <p className={styles.eyebrow}>After the Nexus falls</p>
      <h2 id="review-hero-title" className={styles.title}>Review your last game.</h2>
      <p className={styles.sub}>Find one play worth another look, then ask the Pit what they would’ve done.</p>
      <form
        className={styles.form}
        action="/player"
        method="get"
        onSubmit={event => {
          event.preventDefault();
          const { gameName, tagLine } = splitRiotId(riotId, platform);
          if (!gameName || !tagLine) {
            setError("Enter the player’s Riot ID with its #tag.");
            return;
          }
          openReview(`${gameName}#${tagLine}`, platform);
        }}
      >
        <input type="hidden" name="review" value="1" />
        <PlayerNameInput
          name="riotId" label="Riot ID" scope="players" region={platform} value={riotId}
          onChange={value => {
            setRiotId(value);
            setError("");
          }}
          onSelect={suggestion => {
            if (suggestion.kind === "player") openReview(suggestion.riotId, suggestion.platform);
          }}
          placeholder={platform === "na1" ? "Player name or Name#TAG" : "Name#TAG"}
          required maxLength={50}
        />
        <select name="platform" value={platform} onChange={event => setPlatform(event.target.value)} aria-label="Server">
          {platforms.map(p => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <button type="submit" className={styles.primary} disabled={lookingUp}>
          {lookingUp ? "Looking up…" : "Look up a player ↗"}
        </button>
        <button type="button" className={styles.secondary} aria-expanded={exampleOpen}
          onClick={() => setExampleOpen(open => !open)}>
          See an example
        </button>
      </form>
      {platform === "na1" && <small className={styles.note}>Names use #NA1 by default. Include a custom tag if needed.</small>}
      <ActionFeedback error={error} />
      {exampleOpen && children}
    </section>
  );
}
