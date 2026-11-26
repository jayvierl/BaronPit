"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionFeedback, usePostAction } from "./post-action";

export function WithdrawSubmission({ kind, id, onWithdraw }: {
  kind: "post" | "comment";
  id: number;
  onWithdraw?: () => void;
}) {
  const action = usePostAction();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);

  async function withdraw() {
    if (await action.send("/api/social/withdraw", { kind, id })) {
      setDone(true);
      onWithdraw?.();
      router.refresh();
    }
  }

  if (done) return <span role="status" className="meta">Withdrawn</span>;
  if (!confirm) {
    return <button type="button" className="text-btn" onClick={() => setConfirm(true)}>
      Withdraw {kind === "post" ? "post" : "reply"}
    </button>;
  }
  return <span>
    <span className="meta">Hide this {kind === "post" ? "thread" : "reply and its replies"} from other players?</span>{" "}
    <button type="button" className="text-btn" disabled={action.busy} onClick={withdraw}>
      {action.busy ? "Withdrawing…" : "Confirm withdrawal"}
    </button>{" "}
    <button type="button" className="text-btn" disabled={action.busy} onClick={() => setConfirm(false)}>Keep it</button>
    <ActionFeedback error={action.error} />
  </span>;
}
