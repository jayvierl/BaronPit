import { beforeEach, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { searchNameSuggestions } from "@/lib/search-suggestions";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/search-suggestions", async original => ({
  ...await original<typeof import("@/lib/search-suggestions")>(), searchNameSuggestions: vi.fn(),
}));
beforeEach(() => { vi.resetAllMocks(); });
const request = (query: string) => GET(new Request("https://example.invalid/api/search/suggestions?" + query));

it("binds name discovery to the current viewer and prevents shared caches", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 19 } as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>);
  const suggestions = [{ kind: "player" as const, riotId: "Jay Lewis#NA1", platform: "na1" as const }];
  vi.mocked(searchNameSuggestions).mockResolvedValue(suggestions);
  const res = await request("q=Ja&region=na1&scope=players");
  expect(await res.json()).toEqual({ suggestions });
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.headers.get("vary")).toBe("Cookie");
  expect(searchNameSuggestions).toHaveBeenCalledWith("Ja", "players", 19, "na1");
});

it("avoids storage for invalid or undersized searches and fails closed when a session cannot be checked", async () => {
  expect((await request("q=j&scope=rooms")).status).toBe(400);
  expect((await request("q=jay&region=unknown")).status).toBe(400);
  expect((await request("q=" + "j".repeat(81))).status).toBe(400);
  expect(await (await request("q=j")).json()).toEqual({ suggestions: [] });
  expect(getCurrentUser).not.toHaveBeenCalled();
  vi.mocked(getCurrentUser).mockRejectedValue(new Error("Private error detail"));
  const response = await request("q=jay");
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("Private error detail");
  expect(searchNameSuggestions).not.toHaveBeenCalled();
});
