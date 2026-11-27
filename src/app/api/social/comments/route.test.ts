import { beforeEach, expect, it, vi } from "vitest";
import { getCurrentUser, type User } from "@/lib/auth";
import { listComments } from "@/lib/social";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/social", () => ({ listComments: vi.fn() }));

const viewer: User = {
  id: 11, email: "fixture@example.test", displayName: "Fixture", avatarHue: 1, bio: "",
  createdAt: "2026-11-01", bannedUntil: null, strikeCount: 0, ageBand: "adult", termsCurrent: true,
};
const request = (expected?: string) => new Request("https://fixture.invalid/api/social/comments?postId=42", {
  headers: expected === undefined ? undefined : { "x-expected-viewer": expected },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listComments).mockResolvedValue([]);
});

it.each([
  ["12", viewer],
  ["guest", viewer],
  ["11", null],
] as const)("rejects an outdated reply view before reading from the current cookie's account (%s)", async (expected, current) => {
  vi.mocked(getCurrentUser).mockResolvedValue(current);
  const response = await GET(request(expected));
  expect(response.status).toBe(409);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).not.toHaveProperty("comments");
  expect(listComments).not.toHaveBeenCalled();
});

it("keeps matching signed-in, guest and older callers on the server-selected audience", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(viewer);
  expect((await GET(request("11"))).status).toBe(200);
  expect((await GET(request())).status).toBe(200);
  expect(listComments).toHaveBeenNthCalledWith(1,42,viewer);
  expect(listComments).toHaveBeenNthCalledWith(2,42,viewer);
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await GET(request("guest"))).status).toBe(200);
  expect(listComments).toHaveBeenNthCalledWith(3,42,null);
});
