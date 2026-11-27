import { expect, it } from "vitest";
import { editedTagDraft, sliceTagDraft } from "./tag-editing";
import { plainBodyText } from "./game-tags";

const item = "[[i:1058|Needlessly Large Rod]]";
const champ = "[[c:Ashe|Ashe]]";

it("keeps completed tags intact while the author types around them", () => {
  const body = "And " + item + " on " + champ;
  const visible = plainBodyText(body);
  expect(visible).toBe("And Needlessly Large Rod on Ashe");
  expect(editedTagDraft(body, visible + " today", visible.length + 6)).toBe(body + " today");
  expect(editedTagDraft(body, "Buy " + visible, 4)).toBe("Buy " + body);
});

it("releases only the edited name, with no token fragments", () => {
  expect(editedTagDraft(champ + " " + item, "Ash " + plainBodyText(item), 3)).toBe("Ash " + item);
  expect(sliceTagDraft(item, 11)).toBe("Large Rod");
  expect(editedTagDraft(item + " " + champ, "Rod Ashe", 0)).toBe("Rod " + champ);
});

it("resolves repeated names using the caret position", () => {
  expect(editedTagDraft("Ashe " + champ, "Ashe", 0)).toBe(champ);
  expect(editedTagDraft("Ashe " + champ, "Ashe", 4)).toBe("Ashe");
});
