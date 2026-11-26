import type { Metadata } from "next";
import { APP_NAME } from "./brand";
import { validId } from "./ids";
import { publicProfile } from "./player-insights";
import { getRoom } from "./rooms";
import { shareExcerpt, shareMetadata } from "./share-metadata";

export const unavailableCommunityPreview: Metadata = {
  title: "Page unavailable",
  robots: { index: false, follow: false },
  openGraph: null,
  twitter: null,
  alternates: null,
};

export async function roomMetadata(slug: string, viewerId?: number): Promise<Metadata> {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return unavailableCommunityPreview;
  const room = await getRoom(slug, viewerId);
  if (!room) return unavailableCommunityPreview;
  const name = shareExcerpt(room.name) || "Community room";
  const description = shareExcerpt(room.description) || `Read conversations in ${name}.`;
  return shareMetadata(`/rooms/${room.slug}`, `${name} · ${APP_NAME}`, description, "website");
}

export async function profileMetadata(rawId: string, viewerId: number | null): Promise<Metadata> {
  const id = Number(rawId);
  if (!/^\d+$/.test(rawId) || !validId(id)) return unavailableCommunityPreview;
  const profile = await publicProfile(id, viewerId, new Date().toISOString().slice(0, 10));
  if (!profile) return unavailableCommunityPreview;
  const name = shareExcerpt(profile.name) || "Community member";
  // Unfurls travel off-site. Keep bios, profile photos, Riot identities and stats on the profile.
  return shareMetadata(`/u/${id}`, `${name} · ${APP_NAME}`, `Read ${name}’s threads and replies.`, "profile");
}
