import Link from "next/link";
import { dbAvailable } from "@/lib/db";
import { homePlayerSuggestions } from "@/lib/home-player-suggestions";
import { signInHref } from "@/lib/signin-return";
import { FollowButton } from "./social-ui";
import { Avatar } from "./ui";
import rail from "./home-discovery-rail.module.css";
import styles from "./home-player-suggestions.module.css";

export async function HomePlayerSuggestions({ viewerId }: { viewerId: number | null }) {
  const players = dbAvailable() ? await homePlayerSuggestions(viewerId).catch(() => []) : [];
  if (!players.length) return null;

  return (
    <section className={rail.section} aria-labelledby="home-players-title">
      <h2 id="home-players-title">Players to follow</h2>
      <ul className={rail.list}>
        {players.map(({ id, name, hue, avatar, postId }) => {
          const profile = `/u/${id}`;
          return (
            <li className={styles.row} key={id}>
              <Avatar name={name} hue={hue} avatar={avatar} size={30} />
              <div className={rail.identity}>
                <Link href={profile} className={styles.name} prefetch={false}>{name}</Link>
                <small><Link href={`/post/${postId}`} aria-label={`Recent post by ${name}`} prefetch={false}>Recent post</Link></small>
              </div>
              {viewerId === null
                ? <Link className={styles.signIn} href={signInHref(profile)} aria-label={`Sign in to follow ${name}`} prefetch={false}>Sign in</Link>
                : <FollowButton userId={id} initial={false} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
