import { afterEach, describe, expect, it, vi } from "vitest";
import { lobbyRallyAt, watchLobbyClock } from "./lobby-rally";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("community lobby clock", () => {
  it("opens only for the final six seconds and repeats at the UTC boundary", () => {
    for (const start of [0, 360_000, Date.UTC(2026, 10, 26)]) {
      expect(lobbyRallyAt(start)).toEqual({ open: false, seconds: 354 });
      expect(lobbyRallyAt(start + 353_999)).toEqual({ open: false, seconds: 1 });
      expect(lobbyRallyAt(start + 354_000)).toEqual({ open: true, seconds: 6 });
      expect(lobbyRallyAt(start + 359_999)).toEqual({ open: true, seconds: 1 });
      expect(lobbyRallyAt(start + 360_000)).toEqual({ open: false, seconds: 354 });
    }
  });

  it("uses wall time, suspends in background tabs and detaches on close", () => {
    vi.useFakeTimers();
    vi.setSystemTime(353_999);
    const tab = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("document", tab);
    const receive = vi.fn();
    const stop = watchLobbyClock(receive);
    expect(receive).toHaveBeenLastCalledWith(353_999);
    vi.advanceTimersByTime(1);
    expect(receive).toHaveBeenLastCalledWith(354_000);
    tab.hidden = true;
    tab.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(600_000);
    expect(receive).toHaveBeenCalledTimes(2);
    tab.hidden = false;
    tab.dispatchEvent(new Event("visibilitychange"));
    expect(receive).toHaveBeenLastCalledWith(954_000);
    stop();
    tab.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(3_000);
    expect(receive).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
