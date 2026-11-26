import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isBanned } from "@/lib/auth";
import { reviewablePhotos } from "@/lib/profile-photo-review";
import { signInHref } from "@/lib/signin-return";
import { PhotoReview } from "./review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile photo review", robots: {index: false, follow: false} };

export default async function ReviewPhotosPage({ searchParams }: {
  searchParams: Promise<{ before?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) redirect(signInHref("/admin/moderation/photos"));
  if (!isAdmin(user.email) || isBanned(user)) notFound();
  const cursor = typeof params.before === "string" ? params.before : undefined;
  const page = await reviewablePhotos(user, cursor);
  return <>
    <Link className="text-btn" href="/admin/moderation">← Moderation</Link>
    <h1 className="page-title">Profile photo review</h1>
    {page.items.length > 0
      ? <p className="meta">These photos passed automated screening and need a human decision before the member can use them.</p>
      : <p>No photos are waiting on this page.</p>}
    {page.items.map(photo => <PhotoReview key={photo.id} photo={photo} />)}
    {page.next && <Link className="btn secondary" href={"/admin/moderation/photos?before=" + encodeURIComponent(page.next)}>Next photos</Link>}
    {cursor && <p><Link href="/admin/moderation/photos">Back to the first page</Link></p>}
  </>;
}
