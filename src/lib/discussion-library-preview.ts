import type { Metadata } from "next";
import { APP_NAME } from "./brand";
import { publicDiscussion } from "./discussion-library";
import { validId } from "./ids";
import { shareExcerpt, shareMetadata, truncateAtWordBoundary } from "./share-metadata";

export const unavailableMetadata: Metadata = { title: "Discussion unavailable", robots: { index: false, follow: false } };

export async function discussionMetadata(rawId: string, viewerId: number | null = null): Promise<Metadata> {
  const id = Number(rawId);
  const post = /^\d+$/.test(rawId) && validId(id) ? await publicDiscussion(id, viewerId).catch(() => null) : null;
  if (!post) return unavailableMetadata;
  const room = shareExcerpt(post.room || "Community");
  const context = [post.champion, post.role].filter(Boolean).join(" ");
  const kind = post.discussionKind === "perspective" ? "perspective" : "question";
  // The post's own words are its title: every post in the same room and
  // context used to unfurl with the identical generic title.
  const ownTitle = post.kind === "clip" ? "" : truncateAtWordBoundary(post.body, 64);
  const title = ownTitle ? `${ownTitle} · ${APP_NAME}`
    : context ? `${shareExcerpt(context)} ${kind} · ${APP_NAME}` : `${room} discussion · ${APP_NAME}`;
  const question = post.kind === "clip" ? "" : post.body;
  const description = [question, post.match].filter(Boolean).join(" — ") || `Read the discussion in ${room} and join the replies.`;
  return shareMetadata("/post/" + id, title, description, "article");
}
