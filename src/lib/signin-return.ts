// Restrict continuation links to rendered app pages, including future nested pages.
// Authentication callbacks, API endpoints and external destinations cannot be continuations.
const APP_PAGE = /^\/(?:review-hour\/?|(?:rooms|post|u|player|profile|lfg|builds|champions|search|questions|playbook|activity|pilot|me|admin|safety|items)(?:\/[a-z\d-]+)*\/?)?$/i;

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 1500 || !value.startsWith("/") ||
      value.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(value)) return "/me";
  try {
    const url = new URL(value, "https://return.invalid");
    if (url.origin !== "https://return.invalid" || !APP_PAGE.test(url.pathname)) return "/me";
    return url.pathname + url.search + url.hash;
  } catch { return "/me"; }
}

export function signInHref(destination: string, mode?: "signup" | "enrol") {
  const search = new URLSearchParams({ next: safeReturnTo(destination) });
  if (mode === "signup") search.set("mode", "signup");
  if (mode === "enrol") search.set("enrol", "1");
  return "/signin?" + search.toString();
}
