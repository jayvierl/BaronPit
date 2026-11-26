type RoomArt = { thumbnail: string; small: string; large: string; width: number; height: number };

const defaultPit = {
  thumbnail: "/rooms/general-160.webp", small: "/baron-room-480.webp", large: "/baron-room-960.webp", width: 960, height: 536,
};
const paintings = {
  "new-players": { thumbnail: "/rooms/new-players-160.webp", small: "/rooms/new-players-480.webp", large: "/rooms/new-players-960.webp", width: 960, height: 540 },
  "off-meta-lab": { thumbnail: "/rooms/off-meta-lab-160.webp", small: "/rooms/off-meta-lab-480.webp", large: "/rooms/off-meta-lab-960.webp", width: 960, height: 540 },
  "patch-meta": { thumbnail: "/rooms/patch-meta-160.webp", small: "/rooms/patch-meta-480.webp", large: "/rooms/patch-meta-960.webp", width: 960, height: 540 },
  "lfg-lobby": { thumbnail: "/baron-duo.webp", small: "/rooms/lfg-lobby-480.webp", large: "/rooms/lfg-lobby-960.webp", width: 960, height: 540 },
} satisfies Record<string, RoomArt>;
const winterPit = {
  thumbnail: "/rooms/baron-pit-winter-160.webp", small: "/rooms/baron-pit-winter-480.webp", large: "/rooms/baron-pit-winter-960.webp", width: 960, height: 540,
};

export function roomArt(slug: string, now = new Date()): RoomArt | undefined {
  // The winter painting is used for the full UTC calendar month of December.
  if (slug === "general") return now.getUTCMonth() === 11 ? winterPit : defaultPit;
  return Object.hasOwn(paintings, slug) ? paintings[slug as keyof typeof paintings] : undefined;
}
