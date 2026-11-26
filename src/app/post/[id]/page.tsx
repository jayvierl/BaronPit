import { isPilotHost } from "@/lib/pilot";
import { FeaturedSample } from "@/components/featured-sample";
import { PilotVisit } from "@/components/pilot-visit";
import { validId } from "@/lib/ids";
import { discussionMetadata, unavailableMetadata } from "@/lib/discussion-library-preview";
import Link from "next/link";
import { ThreadIcon } from "@/components/thread-icon";
import styles from "@/components/thread.module.css";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPost } from "@/lib/social";
import { currentPatch } from "@/lib/riot";
import { DecisionThread } from "@/components/decision-thread";
import { PostCard } from "@/components/post-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, viewer] = await Promise.all([params, getCurrentUser()]);
    return await discussionMetadata(id, viewer?.id ?? null);
  } catch {
    return unavailableMetadata;
  }
}

export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ id }, source] = await Promise.all([params, searchParams]);
  const postId = Number(id);
  if (!/^\d+$/.test(id) || !validId(postId)) notFound();
  const result = await Promise.all([
    getCurrentUser().then(async (user) => ({ user, post: await getPost(postId, user) })),
    currentPatch(),
  ]).catch(() => null);
  if (!result)
    return (
      <div className="card" role="alert">
        <h1>Thread unavailable</h1>
        <p>The conversation couldn’t load. Please try again shortly.</p>
      </div>
    );
  const [{ user, post }, patch] = result;
  if (!post || post.status === "removed") notFound();
  return (
    <>
      {user?.pilotActive && <PilotVisit kind="social" />}
      <header className={styles.detailHeading}>
        <Link href="/" title="Back to feed" aria-label="Back to feed"><ThreadIcon name="back" /></Link>
        <h1>Thread</h1>
      </header>
      <PostCard
        key={post.id}
        post={post}
        patch={patch}
        signedIn={!!user}
        viewerId={user?.id}
        viewerName={user?.displayName}
        viewerHue={user?.avatarHue}
        threadPage
      />
      {post.isQuestion && post.status === "visible" && <DecisionThread postId={postId} user={user} />}
      {user?.pilotActive && !isPilotHost(user) && post.status === "visible" && <FeaturedSample userId={user.id} postId={postId} source={source.from === "weekly-matchup" && post.isQuestion === true}/>}
    </>
  );
}
