"use client";

import { useRef, useState } from "react";
import { postJson } from "@/lib/client";

/** Serialize a control's submissions, keep its last confirmed state, and surface any failure in place. */
export function usePostAction() {
  const [authStep, setAuthStep] = useState<"signin" | "enrol" | null>(null);
  const lock = useRef(false);
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
      setError(result.data.error);
      if (result.status === 401) setAuthStep("signin");
      else if (result.data.enrol) setAuthStep("enrol");
      setReconsider(result.data.reconsider === true);
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, reconsider, authStep, send };
}

export function ActionFeedback({ error }: { error: string }) {
  return error ? (
    <span className="notice err" role="alert">
      {error}
    </span>
  ) : null;
}
