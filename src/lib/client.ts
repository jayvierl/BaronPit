type JsonResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; data: { error: string; reconsider?: boolean; enrol?: boolean }; status?: number };

/** An update is confirmed only by the API's success envelope. Login pages, redirects and interrupted connections are failures. */
export async function postJson(path: string, body: unknown): Promise<JsonResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok === true) return { ok: true, data };
    const fallback =
      response.status === 401
        ? "Sign in to continue."
        : response.status === 429
          ? "You’re making changes too quickly. Try again shortly."
          : "The server couldn’t confirm the change. Refresh to check and try again.";
    const reason = typeof data?.message === "string" ? data.message : data?.error;
    return {
      ok: false,
      status: response.status,
      data: {
        ...(data?.href === "/signin?enrol=1" && { enrol: true }),
        ...(data?.reconsider === true && { reconsider: true }),
        error: typeof reason === "string" && reason.trim() ? reason : fallback,
      },
    };
  } catch {
    return {
      ok: false,
      data: { error: "The change couldn’t be confirmed. Check your connection and refresh before trying again." },
    };
  }
}
