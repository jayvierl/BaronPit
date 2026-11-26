import atlas from "./champion-portrait-atlas.json";

export type AvatarRef =
  | { kind: "initials" }
  | { kind: "champion"; id: string }
  | { kind: "riot-icon"; id: number }
  | { kind: "upload"; id: string; hash: string };

export const INITIAL_AVATAR = Object.freeze({kind:"initials"} as const);
const championIds = new Map(atlas.ids.map((id,index) => [id,index]));
export const AVATAR_PATCH = atlas.patch;

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;

/** Only controlled asset references cross the public profile boundary. */
export function parseAvatar(value: unknown): AvatarRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ref = value as Record<string, unknown>;
  const fields = Object.keys(ref).length;
  if (ref.kind === "initials" && fields === 1) return INITIAL_AVATAR;
  if (ref.kind === "champion" && fields === 2 && typeof ref.id === "string" && championIds.has(ref.id))
    return {kind:"champion",id:ref.id};
  if (ref.kind === "riot-icon" && fields === 2 && typeof ref.id === "number" && Number.isSafeInteger(ref.id) && ref.id >= 0 && ref.id <= 2147483647)
    return {kind:"riot-icon",id:ref.id};
  if (ref.kind === "upload" && fields === 3 && typeof ref.id === "string" && uuid.test(ref.id) &&
      typeof ref.hash === "string" && digest.test(ref.hash)) return {kind:"upload",id:ref.id,hash:ref.hash};
  return null;
}

export function publicAvatar(value: unknown): AvatarRef {
  return parseAvatar(value) ?? INITIAL_AVATAR;
}

export function avatarImageUrl(value: unknown) {
  const ref = parseAvatar(value);
  if (!ref) return undefined;
  if (ref.kind === "upload") return `/api/profile-photo/${ref.id}?v=${ref.hash}`;
  if (ref.kind === "riot-icon") return `https://ddragon.leagueoflegends.com/cdn/${atlas.patch}/img/profileicon/${ref.id}.png`;
  return undefined;
}

/** Shared with the champion directory. All source URLs and sprite positions come from the bundled atlas. */
export function championAvatarArt(id: string, compact = false) {
  const index = championIds.get(id);
  if (index === undefined) return undefined;
  if (compact) return {
    backgroundImage: `url("/champions/${atlas.patch}/${id}.webp")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
  return {
    backgroundImage: `url("/champions/${atlas.patch}.webp")`,
    backgroundSize: `${atlas.columns * 100}% ${atlas.rows * 100}%`,
    backgroundPosition: `${100 * (index % atlas.columns) / (atlas.columns - 1)}% ${100 * Math.floor(index / atlas.columns) / (atlas.rows - 1)}%`,
  };
}

/** The public look-up displays Riot’s own current-patch icon regardless of a member’s profile picture. */
export function isOfficialRiotIcon(url: string) {
  return /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/\d{1,3}\.\d{1,3}\.\d{1,3}\/img\/profileicon\/\d{1,10}\.png$/.test(url);
}
