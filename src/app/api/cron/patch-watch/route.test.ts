import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ watch: vi.fn(), daily: vi.fn(), clean: vi.fn(), duo: vi.fn() }));
vi.mock("@/lib/duo-game-check", () => ({ clearExpiredGameChecks: vi.fn() }));
vi.mock("@/lib/pilot", () => ({ clearExpiredPilotData: vi.fn() }));
vi.mock("@/lib/riot-ownership", () => ({ clearExpiredOwnership: vi.fn() }));
vi.mock("@/lib/social", () => ({ runPatchWatch: mocks.watch }));
vi.mock("@/lib/daily-call", () => ({ runDailyCall: mocks.daily }));
vi.mock("@/lib/room-safety", () => ({ clearExpiredRoomTurns: vi.fn() }));
vi.mock("@/lib/duo", () => ({ clearExpiredDuoListings: mocks.duo }));
vi.mock("@/lib/auth", () => ({ clearExpiredAuthData: mocks.clean }));
vi.mock("@/lib/profile-photo", () => ({ maintainPhotos: vi.fn() }));
import { GET } from "./route";

describe("scheduled patch updates", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
  it.each([["", ""], ["key", ""], ["key", "Bearer different"]])("requires a configured matching secret", async (key, header) => {
    vi.stubEnv("CRON_SECRET",key);
    const r = await GET(new Request("https://example.test/api/cron/patch-watch",{headers:{authorization:header}}));
    expect(r.status).toBe(401);
    expect(mocks.watch).not.toHaveBeenCalled();
    expect(mocks.daily).not.toHaveBeenCalled();
    expect(mocks.clean).not.toHaveBeenCalled();
  });
  it("runs maintenance only on authorised requests and keeps upstream failures private", async () => {
    vi.stubEnv("CRON_SECRET","key");
    const req = new Request("https://example.test/api/cron/patch-watch",{headers:{authorization:"Bearer key"}});
    mocks.watch.mockResolvedValueOnce({patch:"16.23.1",briefings:0}).mockRejectedValueOnce(new Error("internal data"));
    mocks.daily.mockResolvedValue({day:"2026-11-26",opened:1,closed:1,payoffs:1});
    expect(await (await GET(req)).json()).toMatchObject({ok:true,patch:"16.23.1",dailyCall:{opened:1}});
    const unavailable = await GET(req);
    expect(unavailable.status).toBe(503);
    const body = await unavailable.text();
    expect(body).not.toContain("internal data");
    expect(JSON.parse(body)).toMatchObject({dailyCall:{closed:1,payoffs:1}});
    expect(mocks.clean).toHaveBeenCalledTimes(2);
  });

  it("lets the patch job finish if Daily Call storage errors", async () => {
    vi.stubEnv("CRON_SECRET","key");
    const req = new Request("https://example.test/api/cron/patch-watch",{headers:{authorization:"Bearer key"}});
    mocks.watch.mockResolvedValue({patch:"16.23.1",briefings:1});
    mocks.daily.mockRejectedValue(new Error("private database details"));
    const response = await GET(req);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("private database details");
    expect(JSON.parse(body)).toMatchObject({patch:"16.23.1",briefings:1});
  });

  it("runs only Daily Call for an authorized task-only request", async () => {
    vi.stubEnv("CRON_SECRET","key");
    const route = "https://example.test/api/cron/patch-watch?task=daily-call";
    const authorized = (url: string) => new Request(url, { headers: { authorization: "Bearer key" } });
    expect((await GET(new Request(route))).status).toBe(401);
    expect((await GET(authorized(route + "-typo"))).status).toBe(400);
    expect(mocks.daily).not.toHaveBeenCalled();
    mocks.daily.mockResolvedValueOnce({ day: "2026-11-26", opened: 1, closed: 0, payoffs: 0 })
      .mockRejectedValueOnce(new Error("private database details"));
    const seeded = await GET(authorized(route));
    expect(await seeded.json()).toEqual({ ok: true, dailyCall: { day: "2026-11-26", opened: 1, closed: 0, payoffs: 0 } });
    expect(seeded.headers.get("cache-control")).toBe("no-store");
    const unavailable = await GET(authorized(route));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ ok: false, error: "Daily Call could not finish." });
    expect(mocks.watch).not.toHaveBeenCalled();
    expect(mocks.clean).not.toHaveBeenCalled();
    expect(mocks.duo).not.toHaveBeenCalled();
  });
});
