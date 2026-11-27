const options = {
  month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
} as const;
const timestamp = new Intl.DateTimeFormat("en-US", options);
const deadline = new Intl.DateTimeFormat("en-US", { ...options, second: "2-digit" });

export function playerDisplayTime(value: string | undefined, exact = false) {
  const at = new Date(value ?? "");
  return Number.isFinite(at.valueOf()) ? { dateTime: at.toISOString(), label: `${(exact ? deadline : timestamp).format(at)} UTC` } : null;
}
