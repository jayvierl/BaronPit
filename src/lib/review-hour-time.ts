const DAY = 86_400_000;
export const reviewRoles = ["Support", "Bot"] as const;
export type ReviewRole = (typeof reviewRoles)[number];
export const reviewRoleLabel = (role: ReviewRole) => (role === "Bot" ? "Bot carry" : "Support");

export function reviewHour(now = new Date()) {
  // A fixed UTC hour gives a single instant across regions and daylight-saving changes.
  const start = new Date(now);
  start.setUTCHours(21, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + ((6 - start.getUTCDay() + 7) % 7));
  if (now.getTime() >= start.getTime() + 3_600_000) start.setUTCDate(start.getUTCDate() + 7);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 3_600_000).toISOString(),
    live: now >= start,
  };
}

export function featureWeek(now: Date) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return { start: start.toISOString(), previous: new Date(start.getTime() - 7 * DAY).toISOString() };
}
