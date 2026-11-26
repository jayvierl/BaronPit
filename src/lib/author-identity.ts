import type { User } from "./auth";
import type { AvatarRef } from "./avatar";

export type AvatarIdentity = { name: string; hue: number; avatar?: AvatarRef };

/** Only the public display fields belong in client-side post and reply composers. */
export function publicAvatarIdentity(user: Pick<User, "displayName" | "avatarHue" | "avatar"> | null): AvatarIdentity | null {
  return user ? { name: user.displayName, hue: user.avatarHue, avatar: user.avatar } : null;
}
