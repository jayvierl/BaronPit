import { validId } from "./ids";

export type HomeFeedTab = "everyone" | "following";
export type FeedCursor = { asOf: string; before: string; id: number };

// PostgreSQL does not accept ISO's year 0000 when casting to timestamptz.
const timestamp = /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/;

function timestampValue(value: string) {
  const milliseconds = Date.parse(value);
  // Date.parse accepts dates such as November 31 by rolling into the next month.
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 23) === value.slice(0, 23)
    ? milliseconds : NaN;
}

export function readFeedCursor(value: unknown, tab: HomeFeedTab, now = Date.now()): FeedCursor | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{20,140}$/.test(value)) return null;
  const [scope, asOf, before, rawId, extra] = Buffer.from(value, "base64url").toString("utf8").split("|");
  if (scope !== tab || extra !== undefined || !timestamp.test(asOf ?? "") || !timestamp.test(before ?? "") ||
    !/^\d{1,10}$/.test(rawId ?? "")) return null;
  const latest = timestampValue(asOf), point = timestampValue(before), id = Number(rawId);
  if (!Number.isFinite(latest) || !Number.isFinite(point) || point > latest || latest > now || !validId(id)) return null;
  return { asOf, before, id };
}

export function feedCursor(tab: HomeFeedTab, asOf: string, before: string, id: number) {
  return Buffer.from(`${tab}|${asOf}|${before}|${id}`).toString("base64url");
}

export function homeFeedHref(tab: HomeFeedTab, before?: string | null) {
  const params = new URLSearchParams({ tab });
  if (before) params.set("before", before);
  return `/?${params}`;
}
