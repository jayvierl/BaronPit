import Image from "next/image";
import Link from "next/link";
import { publicAvatar, championAvatarArt, avatarImageUrl, isOfficialRiotIcon, type AvatarRef } from "@/lib/avatar";
import { WardMascot } from "./ward-mascot";

type AvatarProps = {
  name: string; hue: number; size?: number; imageUrl?: string; avatar?: AvatarRef; mascot?: boolean;
};

function avatarInitials(name: string) {
  return name.trim().split(/\s+/, 2).map(word => Array.from(word)[0]).join("").toUpperCase() || "?";
}

export function Avatar({ name, hue, size = 40, imageUrl, avatar, mascot = false }: AvatarProps) {
  const ref = publicAvatar(avatar);
  const url = avatarImageUrl(ref) ?? (imageUrl && isOfficialRiotIcon(imageUrl) ? imageUrl : undefined);
  const officialIcon = url && isOfficialRiotIcon(url) ? url : undefined;
  const art = ref.kind === "champion" ? championAvatarArt(ref.id, true)
    : ref.kind === "upload" && url ? { backgroundImage: `url("${url}")` } : undefined;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: `hsl(${hue} 16% 38%)`, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {avatarInitials(name)}
      {mascot ? <WardMascot compact size={size}/> : <>
        {officialIcon && <Image src={officialIcon} alt="" width={size} height={size}
          loading={imageUrl ? "eager" : "lazy"} fetchPriority={imageUrl ? "high" : undefined} />}
        {art && <span className="avatar-art" style={art} />}
      </>}
    </span>
  );
}

export function AvatarProfileLink({ userId, className, ...avatar }: Omit<AvatarProps, "imageUrl"> & {
  userId: number; className?: string;
}) {
  // The monogram is also the visible fallback while an image loads or if it fails.
  return <Link href={`/u/${userId}`} className={className} aria-label={`${avatarInitials(avatar.name)}, ${avatar.name}’s profile`}>
    <Avatar {...avatar} />
  </Link>;
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

export function PermalinkTime({ iso, context }: { iso: string; context: string }) {
  return <><time className="time" dateTime={iso} title={iso} suppressHydrationWarning>{timeAgo(iso)}</time>
    <span className="sr-only"> · {context}</span></>;
}

/** Only the official game news site is linked automatically. Other URLs stay as text. */
const officialNewsLink = /^https:\/\/www\.leagueoflegends\.com\/[a-z-]+\/news\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/i;

export function RichBody({ body, threadHref, threadLinkClassName }: { body: string; threadHref?: string; threadLinkClassName?: string }) {
  const parts = body.split(/(https?:\/\/[^\s]+|#[\p{L}\p{N}_]+)/gu);
  // All prose opens the same thread. Keep one keyboard stop for it even if
  // hashtags or the official news link split the text into several segments.
  const firstProse = threadHref ? parts.findIndex(part => part.trim() && !part.startsWith("#") && !officialNewsLink.test(part)) : -1;
  return (
    <p className="post-body">
      {parts.map((part, i) => {
        if (part.startsWith("#")) return <a key={i} className="tag" href={`/search?q=${encodeURIComponent(part)}`}>{part}</a>;
        if (officialNewsLink.test(part)) {
          return <a key={i} href={part} rel="noopener noreferrer" target="_blank">leagueoflegends.com ↗</a>;
        }
        if (threadHref && part.trim()) return <Link key={i} href={threadHref} prefetch={false}
          className={threadLinkClassName} tabIndex={i === firstProse ? undefined : -1}>{part}</Link>;
        return part;
      })}
    </p>
  );
}
