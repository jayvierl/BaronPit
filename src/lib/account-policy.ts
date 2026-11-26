export const TERMS_VERSION = "2026-11-26";
export type AgeBand = "teen" | "adult";
export function isAgeBand(value: unknown): value is AgeBand {
  return value === "teen" || value === "adult";
}
export function acceptedBand(body: Record<string, unknown>): AgeBand | null {
  return isAgeBand(body.ageBand) && body.termsVersion === TERMS_VERSION && body.accepted === true ? body.ageBand : null;
}

/** Unknown creation times use the most restrictive participation defaults. */
export function inProbation(createdAt: string, now = Date.now()): boolean {
  const start = Date.parse(createdAt);
  return !Number.isFinite(start) || now - start < 24 * 60 * 60 * 1000;
}
