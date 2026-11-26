"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionFeedback, usePostAction } from "./post-action";

export function DuoCancelButton({ id }: { id: number }) {
  const router = useRouter();
  const [cancelled, setCancelled] = useState(false);
  const { busy, error, send } = usePostAction();

  async function cancel() {
    if (!await send("/api/lfg", { action: "cancel-booking", id })) return;
    setCancelled(true);
    router.refresh();
  }

  if (cancelled) return <p role="status">Duo booking canceled.</p>;
  return (
    <details>
      <summary>Cancel booking</summary>
      <p className="meta">This frees both slots and ends contact sharing for this booking.</p>
      <button type="button" className="btn small secondary" disabled={busy} onClick={cancel}>
        {busy ? "Canceling…" : "Confirm cancellation"}
      </button>
      <ActionFeedback error={error} />
    </details>
  );
}
