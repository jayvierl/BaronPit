import Image from "next/image";
import { APP_TAGLINE } from "@/lib/brand";

export function CommunityWelcome() {
  return (
    <p className="community-welcome">
      <Image unoptimized src="/baron-emblem-96.webp" width={44} height={44} alt="" />
      <span>{APP_TAGLINE}</span>
    </p>
  );
}
