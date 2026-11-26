import { APP_NAME } from "./brand";

/**
 * Magic-link email via Resend. The verified sending domain today is
 * riftfix.com (verified 2026-11-25); the display name follows APP_NAME and
 * the address can be overridden wholesale with AUTH_EMAIL_FROM once the
 * final brand domain is verified.
 */
export async function sendMagicLinkEmail(
  to: string,
  link: string,
): Promise<{ ok: true } | { ok: false; error: "not_configured" | "send_failed" }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "not_configured" };
  const from = process.env.AUTH_EMAIL_FROM ?? `${APP_NAME} <noreply@riftfix.com>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `Your ${APP_NAME} sign-in link`,
        text: `Sign in to ${APP_NAME}:\n\n${link}\n\nThis link expires in 15 minutes and can be used once. If you didn't request it, ignore this email.`,
        html: `<p>Sign in to <strong>${APP_NAME}</strong>:</p><p><a href="${link}">Click here to sign in</a></p><p style="color:#666;font-size:13px">This link expires in 15 minutes and can be used once. If you didn't request it, ignore this email.</p>`,
      }),
    });
    if (!res.ok) return { ok: false, error: "send_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "send_failed" };
  }
}
