// Illustrative USD amounts only. This module cannot create a payment or payout.
export const EXAMPLE_PLATFORM_BPS = 1000;
const MAX_PREVIEW_CENTS = 10_000;

export function examplePlatformBps(value: string | undefined): number {
  if (!value || !/^\d{1,5}$/.test(value)) return EXAMPLE_PLATFORM_BPS;
  const rate = Number(value);
  return rate <= 10_000 ? rate : EXAMPLE_PLATFORM_BPS;
}

export function exampleTipSplit(amount: string, platformBps: number) {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match || !Number.isInteger(platformBps) || platformBps < 0 || platformBps > 10_000) return null;
  const total = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (total > MAX_PREVIEW_CENTS) return null;
  const platform = Math.floor((total * platformBps + 5_000) / 10_000);
  return { total, platform, partner: total - platform };
}

// Keep listings usable for ordinary gameplay questions such as “tips for last hitting?”.
const PAID_OFFER = [
  /[$€£]\s*\d|\b\d+(?:[.,]\d{1,2})?\s*(?:usd|dollars?|euros?|bucks)\b/i,
  /\b(?:venmo|cash\s?app|paypal|pay\s?me|paying\s+for|tip\s+(?:me|jar)|tips?\s+(?:required|accepted|welcome|appreciated)|(?:cash|tip|tips|money|payment)\s+(?:for|per)\s+(?:(?:a|the|each)\s+)?(?:win|carry|carries|game|boost|duo|match)|(?:will|can|i.ll)\s+(?:pay|tip)|(?:paid|tipped)\s+(?:per|for|carry|duo))\b/i,
];
export function hasPaymentOffer(note: string) {
  const text = note.normalize("NFKC").replace(/[\u200b-\u200d\ufeff]/g, "");
  return PAID_OFFER.some(pattern => pattern.test(text));
}
