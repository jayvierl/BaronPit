import { describe, expect, it } from "vitest";
import {
  applyTag,
  findTagChampion,
  findTagItem,
  formatTagToken,
  hasTagTokens,
  matchTagEntries,
  parseBodySegments,
  pickSuggestion,
  plainBodyText,
  type TagCatalog,
} from "./game-tags";

const catalog: TagCatalog = {
  championPatch: "16.23.1",
  itemPatch: "16.23.1",
  champions: [
    { id: "Ahri", name: "Ahri", title: "the Nine-Tailed Fox", tags: ["Mage", "Assassin"] },
    { id: "Lux", name: "Lux", title: "the Lady of Luminosity", tags: ["Mage", "Support"] },
    { id: "DrMundo", name: "Dr. Mundo", title: "the Madman of Zaun", tags: ["Tank", "Fighter"] },
  ],
  items: [
    { id: 3031, name: "Infinity Edge", gold: 3500, effect: "+70 Attack Damage", shop: true },
    { id: 1001, name: "Boots", gold: 300, effect: "25 Move Speed", shop: true },
    { id: 3135, name: "The Collector", gold: 3000, effect: "+55 Attack Damage", shop: true },
    { id: 7001, name: "Masterwork Edge", gold: 0, effect: "", shop: false },
  ],
};

describe("tag tokens", () => {
  it("formats champion and item tokens", () => {
    expect(formatTagToken({ kind: "champion", id: "Ahri", name: "Ahri" })).toBe("[[c:Ahri|Ahri]]");
    expect(formatTagToken({ kind: "item", id: "3031", name: "Infinity Edge" })).toBe("[[i:3031|Infinity Edge]]");
  });

  it("parses tokens out of prose and round-trips them", () => {
    const body = "Rush [[i:3031|Infinity Edge]] on [[c:Ahri|Ahri]] first.";
    const segments = parseBodySegments(body);
    expect(segments).toEqual([
      { type: "text", text: "Rush " },
      { type: "tag", tag: { kind: "item", id: "3031", name: "Infinity Edge" } },
      { type: "text", text: " on " },
      { type: "tag", tag: { kind: "champion", id: "Ahri", name: "Ahri" } },
      { type: "text", text: " first." },
    ]);
    const tag = segments[1].type === "tag" ? segments[1].tag : null;
    expect(tag && formatTagToken(tag)).toBe("[[i:3031|Infinity Edge]]");
  });

  it("leaves bodies without tokens untouched", () => {
    expect(parseBodySegments("plain post, no tags")).toEqual([{ type: "text", text: "plain post, no tags" }]);
    expect(hasTagTokens("plain post, no tags")).toBe(false);
    expect(hasTagTokens("one [[c:Lux|Lux]] here")).toBe(true);
  });

  it("does not treat malformed tokens as tags", () => {
    const body = "weird [[x:1|Nope]] and [[c:Ahri]] and [[i:|Boots]] stay text";
    expect(parseBodySegments(body)).toEqual([{ type: "text", text: body }]);
    expect(hasTagTokens(body)).toBe(false);
  });

  it("reads tokens as their names in plain text", () => {
    expect(plainBodyText("on [[c:DrMundo|Dr. Mundo]] with [[i:1001|Boots]]")).toBe("on Dr. Mundo with Boots");
    expect(plainBodyText("no tokens")).toBe("no tokens");
  });
});

describe("catalog matching", () => {
  it("matches champions by name and id, items by name", () => {
    expect(matchTagEntries(catalog, "ahri").champions.map((c) => c.id)).toEqual(["Ahri"]);
    expect(matchTagEntries(catalog, "drmundo").champions.map((c) => c.id)).toEqual(["DrMundo"]);
    expect(matchTagEntries(catalog, "infinity ed").items.map((i) => i.id)).toEqual([3031]);
    expect(matchTagEntries(catalog, "edge").items.map((i) => i.id)).toEqual([3031]);
  });

  it("only suggests shop items", () => {
    expect(matchTagEntries(catalog, "masterwork").items).toEqual([]);
    expect(matchTagEntries(catalog, "edge").items.map((i) => i.id)).not.toContain(7001);
  });

  it("finds entries for rendering by id", () => {
    expect(findTagChampion(catalog, "Lux")?.title).toBe("the Lady of Luminosity");
    expect(findTagItem(catalog, "3031")?.gold).toBe(3500);
    expect(findTagItem(catalog, "not-a-number")).toBeUndefined();
    expect(findTagChampion(catalog, "Teemo")).toBeUndefined();
  });
});

describe("composer suggestions", () => {
  const atEnd = (text: string) => pickSuggestion(catalog, text, text.length);

  it("matches a multi-word item name typed mid-sentence", () => {
    const text = "rush Infinity Ed before fights";
    const pick = pickSuggestion(catalog, text, "rush Infinity Ed".length);
    expect(pick?.phrase).toBe("Infinity Ed");
    expect(pick?.start).toBe(5);
    expect(pick?.matches.items.map((i) => i.id)).toEqual([3031]);
  });

  it("matches a champion name after other words", () => {
    const pick = atEnd("gg ahri");
    expect(pick?.matches.champions.map((c) => c.id)).toEqual(["Ahri"]);
    expect(pick?.start).toBe(3);
  });

  it("triggers on short exact names but stays quiet for short prose", () => {
    expect(atEnd("pick lux")?.matches.champions.map((c) => c.id)).toEqual(["Lux"]);
    expect(atEnd("the")).toBeNull();
    expect(atEnd("the game was close")).toBeNull();
    expect(atEnd("i need boots")?.matches.items.map((i) => i.id)).toEqual([1001]);
  });

  it("stays quiet after a space, inside a token, and in a hashtag", () => {
    expect(atEnd("ahri ")).toBeNull();
    const tokenText = "look [[c:Ahri|Ahri]] go";
    expect(pickSuggestion(catalog, tokenText, 10)).toBeNull();
    expect(atEnd("#ahri")).toBeNull();
    expect(atEnd("")).toBeNull();
  });

  it("applies a chosen tag over the typed phrase", () => {
    const text = "rush Infinity Ed first";
    const pick = pickSuggestion(catalog, text, "rush Infinity Ed".length);
    expect(pick).not.toBeNull();
    const result = applyTag(text, pick!, { kind: "item", id: "3031", name: "Infinity Edge" });
    expect(result.value).toBe("rush [[i:3031|Infinity Edge]] first");
    expect(result.caret).toBe("rush [[i:3031|Infinity Edge]] ".length);
    expect(parseBodySegments(result.value)[1]).toEqual({
      type: "tag",
      tag: { kind: "item", id: "3031", name: "Infinity Edge" },
    });
  });
});
