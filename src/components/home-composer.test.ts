import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Composer } from "./composer";
import { HomeComposer } from "./home-composer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

it.each([null, 7])("provides one closed home compose anchor for viewer %s", (viewerId) => {
  const html = renderToStaticMarkup(createElement(HomeComposer, {
    viewerId, patch: "16.23.1", champions: ["Ahri"], viewerIdentity: viewerId === null ? null : { name: "Arc", hue: 80 },
  }));
  expect(html.match(/id="compose"/g)).toHaveLength(1);
  expect(html).toMatch(/^<details\b[^>]*><summary/);
  expect(html).not.toMatch(/^<details[^>]*\bopen[=> ]/);
  expect(html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1]).toContain("Post to the Pit");
  expect(html).toMatch(/<\/summary><(div|fieldset)\b[^>]*id="compose"[^>]*aria-label="Post to the Pit"/);
  expect(html).toContain("<textarea");
  if (viewerId === null) expect(html).toContain("Sign in to post");
  else for (const label of ["Text", "Build", "Poll", "Clip", "Post"]) expect(html).toContain(`>${label}</button>`);
});

it("keeps the room editor's local anchor and generic controls", () => {
  const html = renderToStaticMarkup(createElement(Composer, { roomId: 1, viewerId: 7, patch: "16.23.1", champions: [] }));
  expect(html).toMatch(/<fieldset\b[^>]*id="compose"[^>]*aria-label="Post in this room"/);
  expect(html).toContain(">Post</button>");
});
