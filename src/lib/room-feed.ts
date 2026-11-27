import { readPosts } from "./post-reader";

export const roomFeeds = [
  { key: "all", label: "All", filter: {} },
  { key: "questions", label: "Questions", filter: { questions: true } },
  { key: "builds", label: "Builds", filter: { kind: "build" } },
  { key: "polls", label: "Polls", filter: { kind: "poll" } },
] as const;

export function roomFeedFromParam(value: unknown) {
  return roomFeeds.find(view => view.key === value) ?? roomFeeds[0];
}

export function roomFeedHref(slug: string, key: typeof roomFeeds[number]["key"]) {
  const path = "/rooms/" + encodeURIComponent(slug);
  return key === "all" ? path : path + "?feed=" + key;
}

export function readRoomFeed(roomId: number, viewerId: number | null, view: typeof roomFeeds[number], limit = 30) {
  return readPosts(viewerId, { roomId, ...view.filter }, limit);
}
