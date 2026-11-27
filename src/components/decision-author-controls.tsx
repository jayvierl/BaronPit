"use client";

import { tagExcerpt } from "@/lib/tag-excerpt";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trialOutcomes, type TrialOutcome } from "@/lib/decisions-input";
import { ActionFeedback, usePostAction } from "./post-action";
import styles from "@/app/questions/questions.module.css";

type Props = {
  postId: number;
  acceptedId?: number;
  choices: { id: number; name: string; body: string }[];
  games: { matchId: string; champion: string; win: boolean }[];
  outcome: TrialOutcome | null;
  attachedId?: string;
};
export function DecisionAuthorControls({ postId, acceptedId, choices, games, outcome, attachedId }: Props) {
  const action = usePostAction(),
    router = useRouter();
  const [notice, setNotice] = useState("");
  async function save(payload: Record<string, unknown>, message: string) {
    setNotice("");
    if (await action.send("/api/questions", { postId, ...payload })) {
      setNotice(message);
      router.refresh();
    }
  }
  return (
    <>
      {choices.length > 0 ? (
        <form
          className={styles.trial}
          onSubmit={(e) => {
            e.preventDefault();
            const id = Number(new FormData(e.currentTarget).get("answerId"));
            void save({ action: "accept", answerId: id }, "Helpful answer saved.");
          }}
        >
          <label>
            Choose a helpful reply
            <select name="answerId" key={acceptedId ?? 0} defaultValue={acceptedId ?? ""} required>
              <option value="">Choose a reply</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {tagExcerpt(c.body, 120)}
                </option>
              ))}
            </select>
          </label>
          {outcome && (
            <small className="meta">
              Choosing a different answer clears the follow-up for the previous answer.
            </small>
          )}
          <div>
            <button className="btn secondary small" disabled={action.busy}>
              Save helpful answer
            </button>
          </div>
        </form>
      ) : (
        <p className="meta">
          You can choose a helpful answer when another player replies directly to your question.
        </p>
      )}
      {acceptedId && (
        <form
          key={acceptedId}
          className={styles.trial}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void save(
              {
                action: "trial",
                answerId: acceptedId,
                outcome: data.get("outcome"),
                matchId: data.get("matchId") || null,
              },
              "Follow-up saved.",
            );
          }}
        >
          <h3>I tried this</h3>
          <label>
            How did it go?
            <select name="outcome" defaultValue={outcome ?? ""} required>
              <option value="">Choose a result</option>
              {Object.entries(trialOutcomes).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {games.length > 0 && (
            <label>
              Optional recent game
              <select
                name="matchId"
                defaultValue={games.some((g) => g.matchId === attachedId) ? attachedId : ""}
              >
                <option value="">No game attached</option>
                {games.map((g) => (
                  <option value={g.matchId} key={g.matchId}>
                    {g.champion} · {g.win ? "Victory" : "Defeat"} · {g.matchId}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div>
            <button className="btn small" disabled={action.busy}>
              {outcome ? "Update follow-up" : "Share follow-up"}
            </button>
          </div>
        </form>
      )}
      <ActionFeedback error={action.error} />
      {notice && <p role="status">{notice}</p>}
    </>
  );
}
