import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import SignInPage from "./page";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getCurrentUser: session }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({}),
  redirect: (href: string) => { throw new Error(href); },
}));

const next = "/post/42#replies-42";
const eligibility = () => SignInPage({ searchParams: Promise.resolve({ enrol: "1", next }) });
beforeEach(() => { session.mockReset(); });

it("sends a signed-out enrolment visitor to email sign-in with the original destination", async () => {
  session.mockResolvedValue(null);
  await expect(eligibility()).rejects.toThrow("/signin?" + new URLSearchParams({ next }));
});

it("locks the already recorded age group while renewing terms", async () => {
  session.mockResolvedValue({ id: 42, ageBand: "adult", termsCurrent: false });
  const html = renderToStaticMarkup(await eligibility());
  expect(html).toContain('<select id="age-band" required="" disabled="">');
  expect(html).toContain('<option value="adult" selected="">');
  expect(html).toContain("Save and continue");
  expect(html).toContain('<form method="post">');
});

it("continues when terms are already current and shows a retry state for session outages", async () => {
  session.mockResolvedValueOnce({ ageBand: "adult", termsCurrent: true });
  await expect(eligibility()).rejects.toThrow(next);
  session.mockRejectedValueOnce(new Error("fixture unavailable"));
  expect(renderToStaticMarkup(await eligibility())).toContain("Refresh this page to try again.");
});
