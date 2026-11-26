"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client";
import { LocalReviewTime } from "./review-hour-controls";
import type { EveningRole } from "@/lib/duo-evening";

export function DuoEveningForm({ start, saved, canVolunteer, study, sampling }: {
  start: string; saved: EveningRole | null; canVolunteer: boolean; study: boolean; sampling: boolean;
}) {
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const router = useRouter();
  async function submit(body: Record<string,unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    const result = await postJson("/api/pilot/evening", body);
    setMessage(result.ok ? success : result.data.error);
    if (result.ok) router.refresh();
    setBusy(false);
  }
  return <>
    <p><LocalReviewTime start={start} end={new Date(Date.parse(start)+3600000).toISOString()}/></p>
    {saved && <p>Your availability is saved as {saved === "Bottom" ? "bot carry" : "support"}.
      {" "}<button className="text-btn" disabled={busy} onClick={()=>void submit({action:"clear"},"Your availability was removed.")}>Remove my availability</button></p>}
    {canVolunteer && <form key={start+String(saved)} onSubmit={event=>{
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void submit({action:"save", consent:form.has("consent"), role:form.get("role"), start},"Your availability was saved.");
    }}>
      <label className="field">My role
        <select name="role" defaultValue={saved ?? ""} required>
          <option value="" disabled>Choose a role</option><option value="Bottom">Bot carry</option><option value="Support">Support</option>
        </select>
      </label>
      <label><input name="consent" type="checkbox" required/> I play on NA and agree to count my availability for this hour.</label>
      <p><button className="btn secondary" disabled={busy}>{saved ? "Update availability" : "Count my availability"}</button></p>
    </form>}
    {study && <div>
      <h3>Optional board measurement</h3>
      <p>On your first Suggested visit each UTC day with a saved plan, count whether an open partner fits. Staff see totals. Turning this off deletes your recorded days.</p>
      <button className="text-btn" disabled={busy} onClick={()=>void submit({action:sampling ? "stop-sampling" : "sample", consent:!sampling},
        sampling ? "Your board measurements were deleted." : "Your board measurement is on.")}>{sampling ? "Stop counting my visits" : "Count my eligible visits"}</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </>;
}
