import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { signInHref } from "@/lib/signin-return";
import EditProfile from "./page";

const { session, linked } = vi.hoisted(() => ({ session: vi.fn(), linked: vi.fn() }));
vi.mock("@/lib/auth", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/auth")>(), getCurrentUser: session }));
vi.mock("@/lib/player-insights", () => ({ linkedPlayerIdentities: linked }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(href); } }));

const destination = "/profile/edit?from=account";
const openEditor = () => EditProfile({ searchParams: Promise.resolve({ from: "account" }) });
beforeEach(() => {
  session.mockReset();
  linked.mockReset();
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false");
});
afterEach(() => vi.unstubAllEnvs());

it("preserves the editor return path while renewing terms before editing", async () => {
  session.mockResolvedValue({ termsCurrent: false });
  await expect(openEditor()).rejects.toThrow(signInHref(destination, "enrol"));
  expect(linked).not.toHaveBeenCalled();
});

it("offers private photo removal while publishing is restricted or paused", async () => {
  session.mockResolvedValueOnce({ safetyStatus: "held", termsCurrent: false });
  const restricted = renderToStaticMarkup(await openEditor());
  expect(restricted).toContain("Your account is temporarily restricted.");
  expect(restricted).toContain('href="/me/safety#uploaded-photos"');

  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "true");
  session.mockResolvedValueOnce({ termsCurrent: true });
  const paused = renderToStaticMarkup(await openEditor());
  expect(paused).toContain("Publishing profile changes is temporarily paused.");
  expect(paused).toContain('href="/me/safety#uploaded-photos"');
  expect(linked).not.toHaveBeenCalled();
});
