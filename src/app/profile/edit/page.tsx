import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { signInHref } from "@/lib/signin-return";
import { linkedPlayers } from "@/lib/player-insights";
import { ProfileEditor } from "@/components/profile-editor";
import catalog from "@/lib/champion-catalog.json";
import atlas from "@/lib/champion-portrait-atlas.json";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit profile" };

const available = new Set(atlas.ids);
const portraits = catalog.list.filter(champion => available.has(champion.id)).map(({ id, name }) => ({ id, name }));

export default async function EditProfile({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const fromAccount = params.from === "account";
  if (!user) redirect(signInHref(fromAccount ? "/profile/edit?from=account" : "/profile/edit"));
  const players = await linkedPlayers(user.id);
  const icons = players.filter((player, index) => Number.isInteger(player.profileIcon) && player.profileIcon >= 0 &&
    players.findIndex(other => other.profileIcon === player.profileIcon) === index)
    .map(player => ({ id: player.profileIcon, name: `${player.gameName}#${player.tagLine}` }));
  return <ProfileEditor name={user.displayName} bio={user.bio} initialLink={user.profileLink ?? ""} hue={user.avatarHue}
    initialAvatar={user.avatar ?? { kind: "initials" }} version={user.profileVersion ?? 0}
    portraits={portraits} riotIcons={icons} returnTo={fromAccount ? "/me" : `/u/${user.id}`} />;
}
