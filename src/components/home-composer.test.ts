import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HomeComposer } from "./home-composer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

it.each([null, 7])("provides one closed home compose anchor for viewer %s", (viewerId) => {
  const html = renderToStaticMarkup(createElement(HomeComposer, {
    viewerId, patch: "16.23.1", champions: ["Ahri"], viewerIdentity: viewerId === null ? null : { name: "Arc", hue: 80 },
  }));
  expect(html.match(/id="compose"/g)).toHaveLength(1);
  expect(html).toMatch(/^<details id="compose"[^>]*><summary/);
  expect(html).not.toMatch(/^<details[^>]*\bopen[=> ]/);
  expect(html).toContain("Start a thread");
  expect(html).toContain("<textarea");
  if (viewerId === null) expect(html).toContain("Sign in to post");
  else for (const label of ["Text", "Build", "Poll", "Clip"]) expect(html).toContain(`>${label}</button>`);
});
