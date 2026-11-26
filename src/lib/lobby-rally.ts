const CYCLE_SECONDS = 6 * 60;
const OPEN_SECONDS = 6;

export function lobbyRallyAt(timestamp: number) {
  const elapsed = ((Math.floor(timestamp / 1000) % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;
  const opensAt = CYCLE_SECONDS - OPEN_SECONDS;
  return elapsed >= opensAt
    ? { open: true, seconds: CYCLE_SECONDS - elapsed }
    : { open: false, seconds: opensAt - elapsed };
}

/** Resample wall time at second boundaries; backgrounded tabs can skip many ticks. */
export function watchLobbyClock(onTime: (timestamp: number) => void) {
  let timeout: ReturnType<typeof setTimeout>;
  function tick() {
    clearTimeout(timeout);
    if (document.hidden) return;
    const now = Date.now();
    onTime(now);
    timeout = setTimeout(tick, 1000 - (now % 1000));
  }
  document.addEventListener("visibilitychange", tick);
  tick();
  return () => {
    clearTimeout(timeout);
    document.removeEventListener("visibilitychange", tick);
  };
}
