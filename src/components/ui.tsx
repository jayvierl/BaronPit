export function Avatar({ name, hue, size = 40 }: { name: string; hue: number; size?: number }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") || "?";
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: `hsl(${hue} 16% 38%)`, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric", timeZone:"UTC" });
}

export { rankLabel } from "@/lib/rank";

/** Only the official game news site is linked automatically. Other URLs stay as text. */
export function RichBody({ body }: { body: string }) {
  const parts = body.split(/(https?:\/\/[^\s]+|#[\p{L}\p{N}_]+)/gu);
  return (
    <p className="post-body">
      {parts.map((part, i) => {
        if (part.startsWith("#")) return <a key={i} className="tag" href={`/search?q=${encodeURIComponent(part)}`}>{part}</a>;
        if (/^https:\/\/www\.leagueoflegends\.com\/[a-z-]+\/news\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/i.test(part)) {
          return <a key={i} href={part} rel="noopener noreferrer" target="_blank">leagueoflegends.com ↗</a>;
        }
        return part;
      })}
    </p>
  );
}
