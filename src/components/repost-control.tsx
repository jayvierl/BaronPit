"use client";

import { ThreadIcon } from "./thread-icon";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInHref } from "@/lib/signin-return";
import { ActionFeedback, usePostAction } from "./post-action";

export function RepostControl({postId, initial, signedIn}: {postId: number; initial: boolean; signedIn: boolean}) {
  const router = useRouter();
  const action = usePostAction();
  const [active, setActive] = useState(initial);
  if (!signedIn) return <a className="action-btn" aria-label="Sign in to repost" title="Sign in to repost" href={signInHref(`/post/${postId}`)}><ThreadIcon name="repost" /></a>;
  async function change() {
    const result = await action.send("/api/social/repost", {postId, active: !active});
    if (typeof result?.active === "boolean") {
      setActive(result.active);
      router.refresh();
    }
  }
  return <>
    <button className={`action-btn${active ? " mine" : ""}`} aria-label="Repost" title={active ? "Undo repost" : "Repost"} type="button" aria-pressed={active} disabled={action.busy} onClick={change}>
      <ThreadIcon name="repost" />
    </button>
    <ActionFeedback error={action.error}/>
  </>;
}
