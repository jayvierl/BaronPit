import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { roomArt } from "../lib/room-art";
import { ItemIcons } from "./item-icons";
import { ChampionPortrait } from "./champion-portrait";
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
  expect(banner).not.toContain("<img");
  const css = readFileSync(new URL("./room-artwork.module.css", import.meta.url), "utf8");
  for (const width of [480, 960]) expect(css).toContain(`var(--champion-splash), url("/baron-room-${width}.webp")`);
  const latest = renderToStaticMarkup(createElement(RoomActivity, { name: "Off-Meta Lab", members: 1, latestPost: { id: 42, createdAt: "2026-11-26T12:00:00Z" } }));
  expect(latest).toContain("1 member");
  expect(latest).toContain('href="/post/42"');
  expect(latest).toContain('class="sr-only"> in Off-Meta Lab');
  expect(renderToStaticMarkup(createElement(RoomActivity, { name: "Off-Meta Lab", members: 0 }))).toContain("0 members · No posts yet");
});

it("includes the visible offline abbreviation in the item link's accessible name", () => {
  const html = renderToStaticMarkup(createElement(ItemIcons, { ids:[1036], patch:"16.23.1",
    details:[{id:1036, name:"Long Sword", gold:350, effect:"10 Attack Damage"}],
  }));
  expect(html).toContain('href="/items/1036"');
  expect(html).toContain('aria-label="Long Sword, 350 gold. View item details · LS"');
  expect(html).toContain("img/item/1036.png");
  expect(html).toContain(">LS</span>");
  expect(html).not.toContain("<img");
});

it("layers newer Riot portraits over existing local artwork and gives unknown portraits an initial", () => {
  const bundled = renderToStaticMarkup(createElement(ChampionPortrait, { id:"Ashe", patch:"17.1.1", compact:true }));
  expect(bundled).toContain("/champions/16.23.1/Ashe.webp");
  expect(bundled).toContain("/17.1.1/img/champion/Ashe.png");
  const unknown = renderToStaticMarkup(createElement(ChampionPortrait, { id:"NewChampion", patch:"17.1.1" }));
  expect(unknown).toContain(">N</span>");
  expect(bundled + unknown).not.toContain("<img");
});
