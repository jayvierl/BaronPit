import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { profileMetadata, unavailableCommunityPreview } from "@/lib/community-preview";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, viewer] = await Promise.all([params, getCurrentUser()]);
    return await profileMetadata(id, viewer?.id ?? null);
  } catch {
    return unavailableCommunityPreview;
  }
}

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
