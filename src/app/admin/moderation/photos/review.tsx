"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionFeedback, usePostAction } from "@/components/post-action";

export function PhotoReview({ photo }: { photo: {id: string; contentHash: string; createdAt: string} }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [done, setDone] = useState("");
  const action = usePostAction();
  const args = {id: photo.id, hash: photo.contentHash};
  async function decide(approve: boolean) {
    if (await action.send("/api/admin/profile-photos", {...args, approve})) {
      setDone(approve ? "Approved for the member to select." : "Photo declined.");
      router.refresh();
    }
  }
  return <article className="card">
    <p className="meta">Submitted <time dateTime={photo.createdAt}>{new Date(photo.createdAt).toLocaleString("en-US", {timeZone:"UTC"})} UTC</time></p>
    {done ? <p role="status">{done}</p> : <>
      <button className="btn secondary" aria-expanded={open} onClick={() => {setOpen(!open); setLoaded(false); setImageFailed(false);}}>{open ? "Hide photo" : "View photo"}</button>
      {open && <div>
        <p><Image src={"/api/admin/profile-photos?" + new URLSearchParams(args)} alt="Submitted profile photo" width={160} height={160}
          unoptimized onLoad={() => setLoaded(true)} onError={() => setImageFailed(true)} /></p>
        {imageFailed && <p role="status">This photo is unavailable. Refresh the queue.</p>}
        <div className="profile-actions">
          <button className="btn" disabled={action.busy || !loaded || imageFailed} onClick={() => void decide(true)}>Approve photo</button>
          <button className="btn secondary" disabled={action.busy || !loaded || imageFailed} onClick={() => void decide(false)}>Decline photo</button>
        </div>
      </div>}
      <ActionFeedback error={action.error}/>
    </>}
  </article>;
}
