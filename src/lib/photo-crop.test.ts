import { expect, it } from "vitest";
import { centeredPhoto, cropSquare } from "./photo-crop";

it("centres a square crop and keeps it inside wide and tall images at every boundary", () => {
  expect(cropSquare(800, 400, centeredPhoto)).toEqual({ left: 200, top: 0, size: 400 });
  expect(cropSquare(400, 800, centeredPhoto)).toEqual({ left: 0, top: 200, size: 400 });
  expect(cropSquare(400, 800, { zoom: 2, x: 100, y: 100 })).toEqual({left:200, top:600, size:200});
  expect(cropSquare(400, 800, { zoom: 2, x: 0, y: 0 })).toEqual({left:0, top:0, size:200});
});
