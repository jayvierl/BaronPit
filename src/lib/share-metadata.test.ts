import { expect, it } from "vitest";
import { shareBodyExcerpt, truncateAtWordBoundary } from "./share-metadata";

it("truncates at a word boundary and marks the cut with an ellipsis", () => {
  const text = "When should the support roam to mid lane after the first dragon fight ends";
  const cut = truncateAtWordBoundary(text, 40);
  expect(cut.endsWith("…")).toBe(true);
  const stem = cut.slice(0, -1);
  expect(text.startsWith(stem)).toBe(true);
  expect(text[stem.length]).toBe(" ");
  expect(stem.length).toBeLessThanOrEqual(40);
});

it("returns short text untouched and never splits a word", () => {
  expect(truncateAtWordBoundary("Short question", 64)).toBe("Short question");
  const cut = shareBodyExcerpt("word ".repeat(60).trim());
  expect(cut.length).toBeLessThanOrEqual(161);
  expect(cut.endsWith("…")).toBe(true);
  expect(cut.slice(0, -1).split(" ").every(word => word === "word")).toBe(true);
});
