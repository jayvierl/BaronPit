import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function MyProfile() {
  const user = await getCurrentUser();
  redirect(user ? `/u/${user.id}` : "/signin?next=/profile");
}
