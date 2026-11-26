import { describe, expect, it } from "vitest";
import { examplePlatformBps, exampleTipSplit, hasPaymentOffer } from "./duo-gratuity";

describe("optional duo appreciation preview", () => {
  it("uses whole cents and assigns the rounding remainder to the other side of the split", () => {
    expect(exampleTipSplit("5", 1000)).toEqual({ total: 500, platform: 50, partner: 450 });
    expect(exampleTipSplit("3.05", 1000)).toEqual({ total: 305, platform: 31, partner: 274 });
    expect(exampleTipSplit("0", 250)).toEqual({ total: 0, platform: 0, partner: 0 });
    expect(exampleTipSplit("100.00", 0)).toEqual({ total: 10_000, platform: 0, partner: 10_000 });
    expect(exampleTipSplit("1", 10_000)).toEqual({ total: 100, platform: 100, partner: 0 });
  });
  it("treats invalid input as unavailable and bounds the configurable illustration", () => {
    for (const value of ["", "1.005", "-1", "100.01", "1e2", "Infinity", "5,75"])
      expect(exampleTipSplit(value, 1000)).toBeNull();
    for (const rate of [-1, 20000, NaN, 10.1]) expect(exampleTipSplit("5", rate)).toBeNull();
    expect(examplePlatformBps("325")).toBe(325);
    expect(examplePlatformBps("0")).toBe(0);
    for (const invalid of [undefined, "", "10001", "9.25", "-5", "some secret"]) expect(examplePlatformBps(invalid)).toBe(1000);
  });
  it("rejects solicitation in listings while preserving ordinary gameplay advice", () => {
    for (const offer of ["tip me on Venmo","tips required","$3 a game","I’ll tip you for carrying","Ｎｅｅｄ $5 per win","10 dollars if we win"])
      expect(hasPaymentOffer(offer)).toBe(true);
    for (const normal of ["any tips for last hitting?", "tips for winning lane", "Buy a ward with 75 gold", "Free to play at 2"])
      expect(hasPaymentOffer(normal)).toBe(false);
  });
});
