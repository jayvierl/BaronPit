import { APP_NAME } from "./brand";

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] as string));

export async function sendMagicLinkEmail(to: string, link: string, signup: boolean):
  Promise<{ ok: true } | { ok: false; error: "not_configured" | "send_failed" }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "not_configured" };
  const intro = signup ? `Welcome to ${APP_NAME}. Follow a champion room, share a build, or join a discussion after your next game.` : `You requested a sign-in link for ${APP_NAME}.`;
  const button = signup ? "Continue to your account" : "Sign in";
  const expiry = "Open this link and confirm in your browser within 15 minutes. It can be used once. If you didn’t request this email, ignore it.";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(8000), redirect: "error",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM ?? `${APP_NAME} <noreply@riftfix.com>`, to,
        subject: signup ? `Welcome to ${APP_NAME}` : `Your ${APP_NAME} sign-in link`,
        text: `${intro}\n\n${button}\n${link}\n\n${expiry}`,
        html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${button}</a></p><p>${expiry}</p>`,
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: "send_failed" };
  } catch { return { ok: false, error: "send_failed" }; }
}
