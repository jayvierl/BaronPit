/** Vote indexes refer to this order on published Baron calls. */
export const BARON_CALL_OPTIONS = ["Baron", "Dragon", "Push the inhib", "Reset & farm"] as const;

export function hasBaronCallOptions(options: readonly string[]): boolean {
  return options.length === BARON_CALL_OPTIONS.length &&
    options.every((option, index) => option === BARON_CALL_OPTIONS[index]);
}
