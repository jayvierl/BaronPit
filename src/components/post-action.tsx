"use client";

import { useRef, useState } from "react";
import { postJson } from "@/lib/client";

/** Serialize a control's submissions, keep its last confirmed state, and surface any failure in place. */
export function usePostAction() {
  const [authStep, setAuthStep] = useState<"signin" | "enrol" | null>(null);
  const lock = useRef(false);
  const draft = useRef<{ signature: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reconsider, setReconsider] = useState(false);
  async function send(path: string, body: unknown) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    setAuthStep(null);
    setReconsider(false);
    try {
      const result = await postJson(path, body);
      if (result.ok) return result.data;
      setError(!result.status && typeof body === "object" && body && "submissionId" in body
        ? "The server couldn’t confirm your submission. Check your connection and try sending this draft again."
        : result.data.error);
      if (result.status === 401) setAuthStep("signin");
      else if (result.data.enrol) setAuthStep("enrol");
      setReconsider(result.data.reconsider === true);
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  // A retry after a lost response or a moderation nudge must address the original submission.
  async function sendDraft(path: string, body: Record<string, unknown>) {
    if (lock.current) return null;
    const signature = JSON.stringify([path, { ...body, submitForReview: undefined }]);
    if (draft.current?.signature !== signature) {
      draft.current = { signature, id: crypto.randomUUID() };
    }
    const result = await send(path, { ...body, submissionId: draft.current.id });
    if (result) draft.current = null;
    return result;
  }
  return { busy, error, reconsider, authStep, send, sendDraft };
}

export function ActionFeedback({ error }: { error: string }) {
  return error ? (
    <span className="notice err" role="alert">
      {error}
    </span>
  ) : null;
}
