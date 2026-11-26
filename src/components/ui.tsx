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
  return new Date(iso).toLocaleDateString();
}

export function rankLabel(tier: string | null, div: string | null, lp: number | null): string {
  if (!tier) return "Unranked";
  const t = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  return `${t} ${div ?? ""}${lp != null ? ` · ${lp} LP` : ""}`.trim();
}

/** Renders #hashtags inside post bodies as links. */
export function RichBody({ body }: { body: string }) {
  const parts = body.split(/(#[\p{L}\p{N}_]+)/gu);
  return (
    <p className="post-body">
      {parts.map((part, i) =>
        part.startsWith("#") ? (
          <a key={i} className="tag" href={`/search?q=${encodeURIComponent(part)}`}>{part}</a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}
