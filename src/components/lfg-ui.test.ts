import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { DuoListing, DuoRequest } from "@/lib/duo";
import { RANKED_QUEUE } from "@/lib/duo-session";
import { LfgBoard } from "./lfg-ui";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const now = Date.UTC(2026, 10, 26, 21);
const listing: DuoListing = { id: 1, roles: ["Support"], champs: [], start: now + 15 * 60_000,
  queue: RANKED_QUEUE, partnerRole: "Any", voice: false, vibe: "both", note: "Play the wave", rank: "Gold II",
  form: null, soloRecord: null, expiresAt: new Date(now + 75 * 60_000).toISOString(), platform: "NA1",
  own: true, requestState: null, held: false };

function render(listings: DuoListing[], time = now, requests: DuoRequest[] = []) {
  return renderToStaticMarkup(createElement(LfgBoard, { listings, requests, fit: null, onlyFit: false, asOf: time,
    hosting: { riotId: "Player#NA1", rankedPilot: true }, pinnedIds: [] }));
}

it("offers a new listing only after the owner’s active listing expires", () => {
  expect(render([listing])).toContain("Close listing");
  expect(render([listing])).not.toContain("Post listing");
  const ended = render([listing], Date.parse(listing.expiresAt));
  expect(ended).not.toContain("Close listing");
  expect(ended).toContain("Post listing");
});

it("distinguishes withdrawn or declined requests from pending offers", () => {
  const peer = { ...listing, own: false };
  expect(render([{ ...peer, requestState: "pending" }])).toContain("Request already sent");
  const closed = render([{ ...peer, requestState: "closed" }]);
  expect(closed).toContain("Your request is closed");
  expect(closed).not.toContain("Request already sent");
  expect(closed).not.toContain("Request this session");
});

it("removes Riot and site-profile links when mutual contact reaches its deadline", () => {
  const mutual: DuoRequest = { id: 1, incoming: true, status: "accepted", rank: "Gold II", riotId: "Peer#NA1",
    socialProfileId: 2, contactEndsAt: now + 60_000, cancellationEndsAt: null, platform: "NA1", requeue: "mutual",
    matchedAt: "2026-10-27T21:01:00Z", session: null, thanks: null };
  expect(render([], now, [mutual])).toContain("Peer#NA1");
  const ended = render([], now + 60_000, [mutual]);
  expect(ended).not.toContain("Peer#NA1");
  expect(ended).not.toContain("Visit duo profile");
});
