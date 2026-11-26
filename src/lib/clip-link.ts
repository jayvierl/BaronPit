/** Clip posts may link to a video page. Canonicalise the URL and drop tracking, redirects, embeds and player parameters. */
export function clipLink(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/$/, "");
  let id: string | undefined | null;
  if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com") {
    if (host === "youtu.be") id = path.slice(1);
    else if (path === "/watch") id = url.searchParams.get("v");
    else id = path.match(/^\/(?:shorts|live)\/([\w-]+)$/)?.[1];
    return id && /^[\w-]{11}$/.test(id) ? new URL("https://www.youtube.com/watch?v=" + id) : null;
  }
  if (host === "clips.twitch.tv" && /^\/[\w-]+$/.test(path)) return new URL("https://clips.twitch.tv" + path);
  if (host === "twitch.tv" && /^\/(?:\w+\/clip\/[\w-]+|videos\/\d+)$/.test(path))
    return new URL("https://www.twitch.tv" + path);
  if (host === "medal.tv" && /^\/games\/[\w-]+\/clips\/[\w-]+$/.test(path))
    return new URL("https://medal.tv" + path);
  if (host === "streamable.com" && /^\/[a-z0-9]+$/i.test(path)) return new URL("https://streamable.com" + path);
  return null;
}
