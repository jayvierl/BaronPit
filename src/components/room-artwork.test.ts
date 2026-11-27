import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { roomArt } from "../lib/room-art";
import { RoomActivity, RoomBanner, RoomThumbnail } from "./room-artwork";

it("selects winter art in December UTC and goes back to the regular Pit banner in January", () => {
  expect(roomArt("general", new Date("2026-11-30T23:59:59.999Z"))?.large).toBe("/baron-room-960.webp");
  expect(roomArt("general", new Date("2026-12-01T00:00:00Z"))?.large).toBe("/rooms/baron-pit-winter-960.webp");
  expect(roomArt("general", new Date("2027-01-01T00:00:00Z"))?.thumbnail).toBe("/rooms/general-160.webp");
  expect(roomArt("constructor")).toBeUndefined();
  expect(roomArt("champ-ashe")).toBeUndefined();
});

it.each(["new-players", "off-meta-lab", "patch-meta", "lfg-lobby"])("renders separate responsive artwork and a small thumbnail for %s", slug => {
  const banner = renderToStaticMarkup(createElement(RoomBanner, { slug, championId: null }));
  expect(banner).toContain(`srcSet="/rooms/${slug}-480.webp 1x, /rooms/${slug}-960.webp 2x"`);
  expect(banner).toContain('fetchPriority="high"');
  const thumb = renderToStaticMarkup(createElement(RoomThumbnail, { slug, asOf: new Date() }));
  expect(thumb).toContain(slug === "lfg-lobby" ? "/baron-duo.webp" : `/rooms/${slug}-160.webp`);
  expect(thumb).not.toContain("-960.webp");
});

it("keeps champion splashes and actual member and post data", () => {
  const banner = renderToStaticMarkup(createElement(RoomBanner, { slug: "champ-ashe", championId: "Ashe" }));
  expect(banner).toContain("cdn/img/champion/splash/Ashe_0.jpg");
  const latest = renderToStaticMarkup(createElement(RoomActivity, { name: "Off-Meta Lab", members: 1, latestPost: { id: 42, createdAt: "2026-11-26T12:00:00Z" } }));
  expect(latest).toContain("1 member");
  expect(latest).toContain('href="/post/42"');
  expect(latest).toContain('class="sr-only"> in Off-Meta Lab');
  expect(renderToStaticMarkup(createElement(RoomActivity, { name: "Off-Meta Lab", members: 0 }))).toContain("0 members · No posts yet");
});
