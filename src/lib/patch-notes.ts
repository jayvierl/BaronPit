export const PATCH_PUBLISHER = "team@wardparty.local";
export const PATCH_NOTES_INDEX = "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/";

// Data Dragon kept its sequential major version when the game switched to year-based patch labels.
export function publicPatch(version: unknown): string | null {
  if (typeof version !== "string") return null;
  const match = /^([1-9]\d?)\.([1-9]\d?)(?:\.\d{1,3})?$/.exec(version);
  if (!match) return null;
  const major = Number(match[1]);
  return [major >= 15 ? major + 10 : major, match[2]].join(".");
}

function articleUrl(label: string) {
  return `https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-${label.replace(".", "-")}-notes/`;
}

// This article was checked during migration. Existing 16.23 posts can be repaired even during an outage.
export function storedNotesUrl(version: string, saved?: unknown) {
  const label = publicPatch(version);
  if (!label) return PATCH_NOTES_INDEX;
  const candidate = articleUrl(label);
  return saved === candidate || label === "26.23" ? candidate : PATCH_NOTES_INDEX;
}

export async function resolveNotesUrl(version: string) {
  const label = publicPatch(version);
  if (!label || label === "26.23") return storedNotesUrl(version);
  const candidate = articleUrl(label);
  try {
    const response = await fetch(candidate, {
      redirect: "error", signal: AbortSignal.timeout(4500), next: { revalidate: 1800 },
    });
    if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
      // An edge can return its missing-page shell with HTTP 200. Confirm the article title too.
      const title = /<title[^>]*>([^<]*)<\/title>/i.exec(await response.text())?.[1] ?? "";
      if (new RegExp(`\\bpatch\\s+${label.replace(".", "\\.")}\\s+notes\\b`, "i").test(title)) return candidate;
    }
  } catch {
    // Link to the official index until Riot publishes an article we can verify.
  }
  return PATCH_NOTES_INDEX;
}

export function briefingText(version: string, roomChampion?: string | null) {
  const label = publicPatch(version);
  if (!label) return "Which recent patch change has affected your games?";
  return roomChampion
    ? `Patch ${label} for ${roomChampion} players. Which matchup or item decision would you approach differently this patch?`
    : `Patch ${label} is live. Which change affected a decision in your most recent game?`;
}
