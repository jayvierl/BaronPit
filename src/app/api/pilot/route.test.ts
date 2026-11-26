import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as pilot } from "./route";
import { POST as review } from "../admin/pilot/route";
import { getCurrentUser, type User } from "@/lib/auth";
import { joinPilot, leavePilot, recordPilotVisit, saveReview } from "@/lib/pilot";
vi.mock("@/lib/auth", async (load) => ({
  ...(await load<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
  rateLimit: vi.fn(async () => true),
}));
vi.mock("@/lib/pilot", async (load) => ({
  ...(await load<typeof import("@/lib/pilot")>()),
  joinPilot: vi.fn(async () => true),
  leavePilot: vi.fn(),
  recordPilotVisit: vi.fn(),
  saveReview: vi.fn(),
}));

const member = { id: 11, email: "player@example.invalid", termsCurrent: true, bannedUntil: null } as User;
const call = (body: unknown, origin = "https://ward.test") =>
  new Request("https://ward.test/api/pilot", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("pilot write routes", () => {
  it("requires a signed-in account, same origin and consent; ignores proposed identities", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await pilot(call({ action: "visit", kind: "social" }))).status).toBe(401);
    vi.mocked(getCurrentUser).mockResolvedValue(member);
    const join = { action: "join", role: "UTILITY", channel: "community", userId: 71, kind: "host" };
    expect((await pilot(call({ ...join, consent: true }, "https://elsewhere.test"))).status).toBe(403);
    expect((await pilot(call(join))).status).toBe(400);
    expect((await pilot(call({ ...join, consent: true }))).status).toBe(200);
    expect(joinPilot).toHaveBeenCalledTimes(1);
    expect(joinPilot).toHaveBeenCalledWith(member, "community", "UTILITY");
  });
  it("preserves withdrawal for restricted users and rejects participant-written admin totals", async () => {
    vi.stubEnv("ADMIN_EMAILS", "staff@example.invalid");
    vi.mocked(getCurrentUser).mockResolvedValue({ ...member, bannedUntil: "2099-01-01" });
    expect((await pilot(call({ action: "leave", id: 999 }))).status).toBe(200);
    expect(leavePilot).toHaveBeenCalledWith(11);
    vi.mocked(getCurrentUser).mockResolvedValue(member);
    expect((await review(call({}))).status).toBe(403);
    expect(saveReview).not.toHaveBeenCalled();
    expect((await pilot(call({ action: "visit", kind: "purchase" }))).status).toBe(400);
    expect(recordPilotVisit).not.toHaveBeenCalled();
  });
});
