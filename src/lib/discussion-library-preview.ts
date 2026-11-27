import type { Metadata } from "next";
import { APP_NAME } from "./brand";
import { publicDiscussion } from "./discussion-library";
import { validId } from "./ids";
import { shareExcerpt, shareMetadata } from "./share-metadata";

export const unavailableMetadata: Metadata = { title: "Discussion unavailable", robots: { index: false, follow: false } };

export async function discussionMetadata(rawId: string, viewerId: number | null = null): Promise<Metadata> {
  const id = Number(rawId);
  const post = /^\d+$/.test(rawId) && validId(id) ? await publicDiscussion(id, viewerId).catch(() => null) : null;
  if (!post) return unavailableMetadata;
  const room = shareExcerpt(post.room || "Community");
  const context = [post.champion, post.role].filter(Boolean).join(" ");
  const kind = post.discussionKind === "perspective" ? "perspective" : "question";
  const title = context ? `${shareExcerpt(context)} ${kind} · ${APP_NAME}` : `${room} discussion · ${APP_NAME}`;
  const question = post.kind === "clip" ? "" : shareExcerpt(post.body);
  const description = [question, post.match].filter(Boolean).join(" — ") || `Read the discussion in ${room} and join the replies.`;
  return shareMetadata("/post/" + id, title, description, "article");
}
