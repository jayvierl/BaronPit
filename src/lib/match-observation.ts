/** SQL for the latest trusted read of a snapshot's match window. Receives internal SQL expressions. */
export function matchObservedMs(snapshot: string, startedAt: string, asOf = "now()") {
  const start = `extract(epoch FROM ${startedAt})*1000`;
  const observed = `(${snapshot}->'matchObservedAt')`;
  const milliseconds = `${observed}::numeric`;
  return `CASE WHEN jsonb_typeof(${observed})='number' THEN
    CASE WHEN ${milliseconds} BETWEEN ${start} AND extract(epoch FROM ${asOf})*1000
      AND ${milliseconds}=trunc(${milliseconds}) THEN ${milliseconds} ELSE ${start} END
    ELSE ${start} END`;
}
