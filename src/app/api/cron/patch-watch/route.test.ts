import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ watch: vi.fn(), clean: vi.fn(), duo: vi.fn() }));
vi.mock("@/lib/duo-game-check", () => ({ clearExpiredGameChecks: vi.fn() }));
vi.mock("@/lib/pilot", () => ({ clearExpiredPilotData: vi.fn() }));
vi.mock("@/lib/riot-ownership", () => ({ clearExpiredOwnership: vi.fn() }));
vi.mock("@/lib/social", () => ({ runPatchWatch: mocks.watch }));
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
    expect(mocks.clean).not.toHaveBeenCalled();
  });
  it("runs maintenance only on authorised requests and keeps upstream failures private", async () => {
    vi.stubEnv("CRON_SECRET","key");
    const req = new Request("https://example.test/api/cron/patch-watch",{headers:{authorization:"Bearer key"}});
    mocks.watch.mockResolvedValueOnce({patch:"16.23.1",briefings:0}).mockRejectedValueOnce(new Error("internal data"));
    expect(await (await GET(req)).json()).toMatchObject({ok:true,patch:"16.23.1"});
    const unavailable = await GET(req);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("internal data");
    expect(mocks.clean).toHaveBeenCalledTimes(2);
  });
});
