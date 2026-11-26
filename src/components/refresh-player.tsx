"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshPlayer() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn secondary"
      disabled={pending}
      aria-busy={pending}
      title="Checks for a new snapshot after the 10-minute cache expires"
      onClick={() => start(() => router.refresh())}
    >
      {pending ? "Checking…" : "Refresh stats"}
    </button>
  );
}
