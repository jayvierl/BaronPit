import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";
import { q, queryRows } from "./db";
import { validId } from "./ids";

export function parseProfileLink(value: unknown, origin: string): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 1024) return undefined;
  const text = value.trim();
  if (!text) return null;
  if (/[\\\s]/.test(text) || text.startsWith("//")) return undefined;
  if (!text.startsWith("/") && !/^https?:\/\//i.test(text)) return undefined;
  try {
    const url = new URL(text, origin);
    if (url.origin !== origin || url.username || url.password) return undefined;
    const path = url.pathname.replace(/\/$/, "");
    if (/^\/rooms\/[a-z0-9][a-z0-9-]{0,79}$/.test(path)) return path;
    const post = /^\/post\/([1-9]\d{0,9})$/.exec(path);
    if (post && validId(Number(post[1]))) return path;
  } catch {
    return undefined;
  }
  return undefined;
}

export async function readProfileLink(path: string, viewerId: number | null) {
  const canonical = parseProfileLink(path, "https://profile.invalid");
  if (!canonical || canonical !== path) return null;
  if (path.startsWith("/rooms/")) {
    const [room] = await q`SELECT name FROM wp_rooms WHERE slug=${path.slice(7)} AND safety_status='visible'`;
    return room ? { href: path, label: String(room.name) } : null;
  }
  const [post] = await queryRows(`WITH ${HIDDEN_AUTHORS}
    SELECT p.kind FROM wp_posts p WHERE p.id=$2 AND ${visiblePostForInteraction}`,
    [viewerId, Number(path.slice(6))]);
  return post ? { href: path, label: post.kind === "build" ? "Featured build" : "Featured discussion" } : null;
}
