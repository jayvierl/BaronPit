import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPost } from "@/lib/social";
import { currentPatch } from "@/lib/riot";
import { CommentSection, PostCard } from "@/components/social-ui";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser().catch(() => null);
  const post = await getPost(Number(id), user).catch(() => null);
  if (!post || post.status === "removed") notFound();
  const patch = await currentPatch();
  return (
    <div>
      <PostCard post={post} patch={patch} signedIn={Boolean(user)} viewerId={user?.id ?? null} />
      <CommentSection
        postId={post.id}
        signedIn={Boolean(user)}
        viewerName={user?.displayName}
        viewerHue={user?.avatarHue}
        allowOneFix={post.kind === "card"}
      />
    </div>
  );
}
