import Link from "next/link";
import { dbAvailable } from "@/lib/db";
import { readCommunityObjective } from "@/lib/community-objective";
import { signInHref } from "@/lib/signin-return";
import { WardMascot } from "./ward-mascot";
import styles from "./community-objective.module.css";

export async function CommunityObjective({ viewerId }: { viewerId: number | null }) {
  const objective = dbAvailable() ? await readCommunityObjective(viewerId).catch(() => null) : null;
  const signInForBuild = viewerId === null && objective?.kind === "builds";
  return (
    <section className={styles.objective} aria-labelledby="community-objective-title">
      <div className={styles.heading}>
        <WardMascot size={36} compact/>
        <h2 id="community-objective-title">Today’s community objective</h2>
      </div>
      {objective ? (
        <>
          <p><strong>{objective.label}</strong></p>
          <progress value={objective.count} max={objective.target} aria-label="Community objective progress" />
          <p className="meta">
            {objective.count} of {objective.target} players · {objective.count >= objective.target ? "Objective secured" : "Resets at 00:00 UTC"}
          </p>
          <p className="meta">Each player counts once. Progress uses contributions visible to you.</p>
          <Link href={signInForBuild ? signInHref(objective.href) : objective.href}>
            {signInForBuild ? "Sign in to share a build" : objective.action}
          </Link>
        </>
      ) : <p role="status">Objective progress is temporarily unavailable. <Link href="/questions">Browse match questions</Link></p>}
    </section>
  );
}
