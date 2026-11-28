import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchGameData } from "./game-search";

const { roster, items, rooms } = vi.hoisted(() => ({
  roster: vi.fn(), items: vi.fn(), rooms: vi.fn(),
}));
vi.mock("./riot", () => ({ championCatalog: roster }));
vi.mock("./build-catalog", () => ({ buildCatalog: items, shopListed: (item: { shop: boolean; variant?: boolean }) => item.shop && !item.variant }));
vi.mock("./rooms", () => ({ visibleChampionRoomSlugs: rooms }));

describe("game results in community search", () => {
  beforeEach(() => {
    roster.mockResolvedValue({ patch: "16.23.1", list: [
      {id:"Kaisa",name:"Kai’Sa"}, {id:"Ashe",name:"Ashe"},
    ] });
    items.mockResolvedValue({ patch:"16.23.1", items: [
      {id:1001,name:"Boots",shop:true}, {id:9001,name:"Boots",shop:false},
      ...["Alpha","Bravo","Charlie","Delta"].map((name,i) => ({id:3010+i,name:name+" Boots",shop:true})),
    ] });
    rooms.mockResolvedValue(["champ-kaisa"]);
  });

  it("finds champions across punctuation and resolves only visible room destinations", async () => {
    expect(await searchGameData(" KÁI'SA ",3)).toMatchObject({
      championPatch:"16.23.1", champions:[{id:"Kaisa",hasRoom:true}], items:[],
    });
    rooms.mockRejectedValueOnce(new Error("Room lookup unavailable"));
    expect((await searchGameData("Ashe",3)).champions).toMatchObject([{id:"Ashe",hasRoom:false}]);
  });

  it("matches item IDs and prioritizes purchasable exact names within the selected surface limit", async () => {
    expect((await searchGameData("1001",3)).items.map(item => item.id)).toEqual([1001]);
    expect((await searchGameData("Boots",3)).items.map(item => item.id)).toEqual([1001,3010,3011]);
    expect((await searchGameData("Boots",20)).items).toHaveLength(5);
    expect(await searchGameData(" - ",3)).toMatchObject({champions:[],items:[]});
  });
});
