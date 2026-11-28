// Stopgap error visibility until a real error tracker is adopted: the error
// boundary forwards a minimal report (message, digest, path — nothing else)
// to /api/client-error, which logs it as one structured line server-side.
// Reporting must never break the boundary, so every failure here is swallowed.
export function reportClientError(error: { message?: unknown; digest?: unknown }): void {
  try {
    const body = JSON.stringify({
      message: typeof error.message === "string" ? error.message.slice(0, 500) : "",
      digest: typeof error.digest === "string" ? error.digest.slice(0, 128) : "",
      path: window.location.pathname.slice(0, 256),
    });
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let error reporting throw inside the error boundary.
  }
}
