/** Positive PostgreSQL integer ID. */
export function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
}
