"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuestionPreference } from "@/lib/decisions";
import { decisionRoles } from "@/lib/decisions-input";
import { usePostAction, ActionFeedback } from "./post-action";
import styles from "@/app/questions/questions.module.css";

export function DecisionPreference({
  saved,
  champions,
}: {
  saved: QuestionPreference | null;
  champions: { id: string; name: string }[];
}) {
  const action = usePostAction(),
    router = useRouter();
  const [notice, setNotice] = useState("");
  async function update(input: Record<string, unknown>) {
    const result = await action.send("/api/questions", { action: "preference", ...input });
    if (!result) return;
    setNotice(
      input.clear ? "Your question preferences were cleared." : "Your question preferences were saved.",
    );
    router.replace(input.clear ? "/questions?mode=unanswered" : "/questions?mode=mine");
    router.refresh();
  }
  return (
    <section className="card">
      <h2>Your answering preferences</h2>
      <p className="meta">
        Choose your role and, optionally, a champion. You’ll see open questions from other players waiting for a first reply.
      </p>
      <form
        key={(saved?.role ?? "") + (saved?.champion ?? "")}
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void update(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <div className={styles.filters}>
          <label>
            Role
            <select name="role" required defaultValue={saved?.role ?? ""}>
              <option value="">Choose your role</option>
              {decisionRoles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Champion
            <select name="champion" defaultValue={saved?.champion ?? ""}>
              <option value="">All champions</option>
              {champions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.controls}>
          <button className="btn small" disabled={action.busy}>
            {saved ? "Update preferences" : "Save preferences"}
          </button>
          {saved && (
            <button
              type="button"
              className="text-btn"
              disabled={action.busy}
              onClick={() => void update({ clear: true })}
            >
              Clear preference
            </button>
          )}
        </div>
        <ActionFeedback error={action.error} />
        {notice && <small role="status">{notice}</small>}
      </form>
    </section>
  );
}
