import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { roomMetadata, unavailableCommunityPreview } from "@/lib/community-preview";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  try {
    const [{ slug }, viewer] = await Promise.all([params, getCurrentUser()]);
    return await roomMetadata(slug, viewer?.id);
  } catch {
    return unavailableCommunityPreview;
  }
}

export default function RoomLayout({ children }: { children: ReactNode }) {
  return children;
}
