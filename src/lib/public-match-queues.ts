// Reviewed matchmade queues for public game context. New modes require review;
// an unknown or missing queue cannot establish consent to publish a custom game.
export const PUBLIC_MATCH_QUEUES = [400, 420, 430, 440, 450, 480, 490] as const;
const allowed = new Set<number>(PUBLIC_MATCH_QUEUES);
export function isPublicMatchQueue(queue: unknown): queue is number {
  return typeof queue === "number" && allowed.has(queue);
}

// The caller supplies an internal SQL identifier, never request input.
// JSON equality also rejects a string that happens to contain a queue number.
export function publicQueueSql(match: string): string {
  return `coalesce((${match}->'queueId') IN (${PUBLIC_MATCH_QUEUES.map(id => `'${id}'::jsonb`).join(",")}), false)`;
}

export function publicSampleSql(snapshot: string): string {
  return `(jsonb_typeof(${snapshot}->'matches')='array' AND ${snapshot}->'matches'->0 IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${snapshot}->'matches')='array'
      THEN ${snapshot}->'matches' ELSE '[]'::jsonb END) AS sampled(m) WHERE NOT ${publicQueueSql("m")}
  ))`;
}
