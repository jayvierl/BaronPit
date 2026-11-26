import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { savedPlaybook, pageCursor } from "@/lib/discussion-library";
import { signInHref } from "@/lib/signin-return";
import { DiscussionList } from "@/components/discussion-library-list";

export const metadata = { title: "Private playbook", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Playbook({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(signInHref("/playbook"));
  const { before } = await searchParams;
  const page = await savedPlaybook(user.id, pageCursor(before)).catch(() => null);
  return <section className="card"><h1>My playbook</h1><p className="meta">Only you can see your saved discussions and replies.</p>
    {page ? <DiscussionList page={page} view="playbook" /> : <p role="alert">Your playbook couldn’t load. Please try again.</p>}
  </section>;
}
