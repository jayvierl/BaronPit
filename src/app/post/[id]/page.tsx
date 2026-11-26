import { isPilotHost } from "@/lib/pilot";
import { FeaturedSample } from "@/components/featured-sample";
import { PilotVisit } from "@/components/pilot-visit";
import { validId } from "@/lib/ids";
import { discussionMetadata, unavailableMetadata } from "@/lib/discussion-library-preview";
import { ContextBackLink } from "@/components/context-back-link";
import styles from "@/components/thread.module.css";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { publicAvatarIdentity } from "@/lib/author-identity";
import { getPost, listComments } from "@/lib/social";
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
  // Small discussions can paint their real replies immediately. On large threads the
  // same visibility-scoped endpoint loads the conversation after the main post.
  const initialComments = post.commentCount === 0 ? [] : post.commentCount <= 25
    ? await listComments(postId, user).catch(() => null) : null;
  const backHref = post.roomSlug ? `/rooms/${post.roomSlug}` : "/";
  return (
    <div className={styles.threadPage}>
      {user?.pilotActive && <PilotVisit kind="social" />}
      <header className={styles.detailHeading}>
        <ContextBackLink fallback={backHref} fallbackLabel={post.roomName ? `Back to ${post.roomName}` : "Back to feed"} />
        <h1>Thread</h1>
      </header>
      <PostCard
        key={post.id}
        post={post}
        patch={patch}
        signedIn={!!user}
        viewerId={user?.id}
        viewerIdentity={publicAvatarIdentity(user)}
        threadPage
        initialComments={initialComments}
      />
      {post.isQuestion && post.status === "visible" && <DecisionThread postId={postId} user={user} />}
      {user?.pilotActive && !isPilotHost(user) && post.status === "visible" && <FeaturedSample userId={user.id} postId={postId} source={source.from === "weekly-matchup" && post.isQuestion === true}/>}
    </div>
  );
}
