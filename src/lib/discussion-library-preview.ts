import type { Metadata } from "next";
import { APP_NAME } from "./brand";
import { publicDiscussion } from "./discussion-library";
import { validId } from "./ids";

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

function excerpt(text: string) {
  return text.replace(/(?:https?:\/\/|www\.)\S+|[^\s@]+@[^\s@]+\.[^\s@]+|@[\w.-]+/gi, "")
    .replace(/\p{Cc}|\p{Cf}/gu, " ").replace(/\s+/g, " ").trim();
}

export const unavailableMetadata: Metadata = { title: "Discussion unavailable", robots: { index: false, follow: false } };

export async function discussionMetadata(rawId: string, viewerId: number | null = null): Promise<Metadata> {
  const id = Number(rawId);
  const post = /^\d+$/.test(rawId) && validId(id) ? await publicDiscussion(id, viewerId).catch(() => null) : null;
  if (!post) return unavailableMetadata;
  const room = excerpt(post.room || "Community");
  const context = [post.champion, post.role].filter(Boolean).join(" ");
  const title = context ? `${excerpt(context)} question · ${APP_NAME}` : `${room} discussion · ${APP_NAME}`;
  const question = post.kind === "clip" ? "" : excerpt(post.body);
  const description = [question, post.match].filter(Boolean).join(" — ") || `Read the discussion in ${room} and join the replies.`;
  const origin = shareOrigin();
  const url = origin ? new URL("/post/" + id, origin).href : undefined;
  const image = origin ? { url: new URL("/discussion-card", origin).href, width: 1200, height: 630, alt: `${APP_NAME} community discussion` } : null;
  return {
    title, description, ...(url && { alternates: { canonical: url } }),
    openGraph: { type: "article", siteName: APP_NAME, title, description, ...(url && { url }), ...(image && { images: [image] }) },
    twitter: { card: "summary_large_image", title, description, ...(image && { images: [image.url] }) },
  };
}
