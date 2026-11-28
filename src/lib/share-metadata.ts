import type { Metadata } from "next";
import { APP_NAME } from "./brand";
import { parseBodySegments } from "./game-tags";

export function shareOrigin() {
  const values = process.env.VERCEL_ENV === "preview"
    ? [process.env.VERCEL_URL]
    : [process.env.APP_ORIGIN, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL];
  for (const configured of values) {
    if (!configured) continue;
    try {
      const url = new URL(configured.includes("://") ? configured : "https://" + configured);
      if (url.protocol === "https:" && !url.username && !url.password) return url.origin;
    } catch { /* try the next configured host */ }
  }
  return process.env.NODE_ENV === "development" ? "http://localhost:" + (process.env.PORT || "3000") : null;
}

export function shareExcerpt(text: string) {
  return text.replace(/(?:https?:\/\/|www\.)\S+|[^\s@]+@[^\s@]+\.[^\s@]+|@[\w.-]+/gi, "")
    .replace(/\p{Cc}|\p{Cf}/gu, " ").replace(/\s+/g, " ").trim();
}

/** Truncate at a word boundary, never mid-word, adding an ellipsis when cut. */
export function truncateAtWordBoundary(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const head = chars.slice(0, max).join("");
  const boundary = head.lastIndexOf(" ");
  const cut = (boundary > 0 ? head.slice(0, boundary) : head).trimEnd();
  return `${cut}…`;
}

/** Social handles are omitted from external unfurls, including Riot IDs containing spaces. */
export function shareBodyExcerpt(body: string) {
  const text = parseBodySegments(body).map(segment => {
    if (segment.type === "text") return segment.text;
    return segment.tag.kind === "player" ? " " : segment.tag.name;
  }).join("");
  return truncateAtWordBoundary(shareExcerpt(text), 160);
}

export function shareMetadata(path: string, title: string, description: string, type: "article" | "website" | "profile"): Metadata {
  const artwork = type === "article"
    ? { path: "/discussion-card", width: 1200, height: 630, alt: `${APP_NAME} community discussion` }
    : { path: "/baron-hero.png", width: 1376, height: 768, alt: `${APP_NAME} community artwork` };
  const origin = shareOrigin();
  const url = origin ? new URL(path, origin).href : undefined;
  const image = origin ? { url: new URL(artwork.path, origin).href, width: artwork.width, height: artwork.height, alt: artwork.alt } : null;
  return {
    title, description, ...(url && { alternates: { canonical: url } }),
    openGraph: { type, siteName: APP_NAME, title, description, ...(url && { url }), ...(image && { images: [image] }) },
    twitter: { card: "summary_large_image", title, description, ...(image && { images: [image.url] }) },
  };
}
