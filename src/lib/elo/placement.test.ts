import { describe, it, expect } from "vitest";
import { kForGames, isProvisional, PLACEMENT_GAMES, K_PLACEMENT, K_NORMAL } from "./placement";

describe("kForGames", () => {
  it("uses placement K below the threshold", () => {
    expect(kForGames(0)).toBe(K_PLACEMENT);
    expect(kForGames(PLACEMENT_GAMES - 1)).toBe(K_PLACEMENT);
  });
  it("uses normal K at and above the threshold", () => {
    expect(kForGames(PLACEMENT_GAMES)).toBe(K_NORMAL);
    expect(kForGames(PLACEMENT_GAMES + 5)).toBe(K_NORMAL);
  });
});

describe("isProvisional", () => {
  it("is true below the threshold", () => {
    expect(isProvisional(0)).toBe(true);
    expect(isProvisional(PLACEMENT_GAMES - 1)).toBe(true);
  });
  it("is false at and above the threshold", () => {
    expect(isProvisional(PLACEMENT_GAMES)).toBe(false);
    expect(isProvisional(PLACEMENT_GAMES + 1)).toBe(false);
  });
});
