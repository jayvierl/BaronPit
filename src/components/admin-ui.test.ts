import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AppealForm, ReviewForm, RoomProtectionForm } from "./admin-ui";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

it("keeps appeal text and staff decisions out of native GET submissions before hydration", () => {
  const forms = [
    createElement(AppealForm, { id: 1 }),
    createElement(ReviewForm, { id: 2, kind: "appeal", rule: "other" }),
    createElement(RoomProtectionForm),
  ];
  for (const form of forms) {
    const html = renderToStaticMarkup(form);
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).toContain("<noscript>");
  }
});
