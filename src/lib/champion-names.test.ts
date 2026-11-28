import { expect, it } from "vitest";
import { sortChampionsByName, type ChampionInfo } from "./riot";
import { championRoomName } from "./rooms";

const champion = (id: string, name: string): ChampionInfo => ({ id, name, title: "", tags: [] });

it("sorts champions by display name, so Wukong (id MonkeyKing) files under W", () => {
  const sorted = sortChampionsByName([
    champion("Mordekaiser", "Mordekaiser"),
    champion("MonkeyKing", "Wukong"),
    champion("MissFortune", "Miss Fortune"),
    champion("AurelionSol", "Aurelion Sol"),
    champion("Warwick", "Warwick"),
  ]);
  expect(sorted.map(c => c.name)).toEqual(["Aurelion Sol", "Miss Fortune", "Mordekaiser", "Warwick", "Wukong"]);
  expect(sorted.at(-1)?.id).toBe("MonkeyKing");
});

it("builds champion room names from the display name", () => {
  expect(championRoomName("Aurelion Sol")).toBe("Aurelion Sol Mains");
  expect(championRoomName("Wukong")).toBe("Wukong Mains");
});
