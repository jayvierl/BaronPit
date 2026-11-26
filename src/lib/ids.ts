/** Positive PostgreSQL integer ID. */
export function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
}

export function validSubmissionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
}
