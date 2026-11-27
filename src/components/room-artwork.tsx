import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { roomArt } from "@/lib/room-art";
import type { Room } from "@/lib/rooms";
import { splashUrl } from "@/lib/pure";
import { timeAgo } from "./ui";
import styles from "./room-artwork.module.css";

const number = new Intl.NumberFormat("en-US");

export function RoomBanner({ slug, championId }: Pick<Room, "slug" | "championId">) {
  if (championId) return <div className={`${styles.banner} ${styles.champion}`} aria-hidden="true"
    style={{ "--champion-splash": `url("${splashUrl(encodeURIComponent(championId))}")` } as CSSProperties}/>;
  const art = roomArt(slug);
  if (!art) return null;
  return <picture className={styles.banner}>
    <source media="(max-width: 480px)" srcSet={`${art.small} 1x, ${art.large} 2x`}/>
    <Image unoptimized width={art.width} height={art.height} src={art.large} alt="" loading="eager" fetchPriority="high"/>
  </picture>;
}

export function RoomThumbnail({ slug, asOf }: { slug: string; asOf: Date }) {
  const art = roomArt(slug, asOf);
  return art ? <Image unoptimized className={styles.thumbnail} width={58} height={42} src={art.thumbnail} alt=""/> : null;
}

export function RoomActivity({ name, members, latestPost }: Pick<Room, "name" | "members" | "latestPost">) {
  return <small className="meta">
    {number.format(members)} {members === 1 ? "member" : "members"}{" · "}
    {latestPost ? <Link href={`/post/${latestPost.id}`} prefetch={false}>
      Latest post <time dateTime={latestPost.createdAt}>{timeAgo(latestPost.createdAt)}</time>
      <span className="sr-only"> in {name}</span>
    </Link> : "No posts yet"}
  </small>;
}
