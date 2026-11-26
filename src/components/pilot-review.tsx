"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { WeeklyReview } from "@/lib/pilot";
import { usePostAction, ActionFeedback } from "./post-action";

export function PilotReview({ reviews, monday }: { reviews: WeeklyReview[]; monday: string }) {
  const [week, setWeek] = useState(monday);
  const [msg, setMsg] = useState("");
  const action = usePostAction();
  const router = useRouter();
  const saved = reviews.find((r) => r.weekStart === week);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const x = Object.fromEntries(fields);
    for (const k of ["hostMinutes", "safetyMinutes", "interviews", "sampled", "useful", "costCents"])
      Object.assign(x, { [k]: Number(x[k]) });
    setMsg("");
    if (await action.send("/api/admin/pilot", x)) {
      setMsg("Weekly totals saved.");
      router.refresh();
    }
  }
  return (
    <details className="card">
      <summary>Record the weekly operations review</summary>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="pilot-week">Week beginning (Monday UTC)</label>
          <select id="pilot-week" name="weekStart" value={week} onChange={(e) => setWeek(e.target.value)}>
            {Array.from({ length: 8 }, (_, n) =>
              new Date(Date.parse(monday + "T00:00:00Z") - n * 7 * 86400000).toISOString().slice(0, 10),
            ).map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </div>
        <fieldset key={week} disabled={action.busy}>
          <legend>{saved ? "Edit this week’s recorded totals" : "This week’s totals"}</legend>
          {(
            [
              ["hostMinutes", "Facilitation minutes", 10080],
              ["safetyMinutes", "Safety coverage minutes", 10080],
              ["costCents", "Allocated provider costs (USD cents)", 10000000],
              ["interviews", "Interviews completed", 1000],
              ["sampled", "Randomly sampled replies reviewed", 10000],
              ["useful", "Sampled replies with a specific, actionable suggestion", 10000],
            ] as const
          ).map(([key, label, max]) => (
            <div className="field" key={key}>
              <label htmlFor={"pilot-" + key}>{label}</label>
              <input
                type="number"
                name={key}
                id={"pilot-" + key}
                defaultValue={saved?.[key]}
                min={0}
                max={max}
                required
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="pilot-drill">Two-person safety drill</label>
            <select id="pilot-drill" name="drill" defaultValue={saved?.drill ?? "unrun"}>
              <option value="unrun">Pending</option>
              <option value="pass">Passed</option>
              <option value="fail">Needs remediation</option>
            </select>
          </div>
        </fieldset>
        <button className="btn secondary" disabled={action.busy}>
          {saved ? "Update weekly totals" : "Save weekly totals"}
        </button>
        <ActionFeedback error={action.error} />
        <p role="status">{msg}</p>
      </form>
    </details>
  );
}
