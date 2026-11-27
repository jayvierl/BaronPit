import { validId } from "./ids";
import type { PostView } from "./post-types";

type ConversationPost = Pick<PostView, "id" | "status" | "kind" | "data" | "body" | "createdAt" | "lastReplyAt" | "commentCount" | "roomId" | "roomName">;

const week = 7 * 24 * 60 * 60 * 1000;
const previewLimit = 86;
const publicKinds = new Set(["text", "build", "poll", "card", "clip"]);

/** Select from the caller's already viewer-filtered feed. Reply counts are lifetime visible totals. */
export function activeConversations(posts: readonly ConversationPost[], asOf: number, joinedRooms: readonly number[] = []) {
  const joinedIds = new Set(joinedRooms);
  const candidates = posts.flatMap(post => {
    if (!validId(post.id) || post.status !== "visible" || !publicKinds.has(post.kind) || post.data.briefing === true ||
      !Number.isSafeInteger(post.commentCount) || post.commentCount < 0) return [];

    const createdAt = Date.parse(post.createdAt);
    if (!Number.isFinite(createdAt) || createdAt > asOf) return [];
    const lastReplyAt = Date.parse(post.lastReplyAt ?? "");
    const activityAt = lastReplyAt >= createdAt && lastReplyAt <= asOf ? lastReplyAt : createdAt;
    if (activityAt < asOf - week) return [];

    const body = post.body.replace(/\s+/gu, " ").trim();
    if (!/[\p{L}\p{N}\p{S}\p{P}]/u.test(body)) return [];
    const characters = Array.from(body);
    const preview = characters.length > previewLimit
      ? characters.slice(0, previewLimit - 1).join("").trimEnd() + "…"
      : body;
    return [{ id: post.id, preview, replies: post.commentCount, activityAt,
      room: post.roomId !== null && joinedIds.has(post.roomId) ? post.roomName : null }];
  }).sort((a, b) => Number(!!b.room) - Number(!!a.room) || b.activityAt - a.activityAt || b.id - a.id);

  const seen = new Set<string>();
  return candidates.filter(item => {
    const key = item.preview.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}
