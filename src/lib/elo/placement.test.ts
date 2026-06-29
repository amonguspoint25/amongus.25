import { describe, it, expect } from "vitest";
import { kForGames, isProvisional, applyPlacementCap, PLACEMENT_GAMES, K_PLACEMENT, K_NORMAL, PLACEMENT_RANK_CEILING } from "./placement";
import { TIERS } from "../rank";

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

it("locks the product-decided threshold and K values", () => {
  expect(PLACEMENT_GAMES).toBe(10);
  expect(K_PLACEMENT).toBe(40);
  expect(K_NORMAL).toBe(24);
});

describe("applyPlacementCap", () => {
  it("caps a provisional player's rating at the Gold ceiling", () => {
    expect(applyPlacementCap(1400, 3)).toBe(PLACEMENT_RANK_CEILING);
    expect(applyPlacementCap(1400, PLACEMENT_GAMES - 1)).toBe(PLACEMENT_RANK_CEILING);
  });
  it("leaves a provisional rating below the ceiling untouched", () => {
    expect(applyPlacementCap(1100, 2)).toBe(1100);
  });
  it("does not cap once placements are done", () => {
    expect(applyPlacementCap(1400, PLACEMENT_GAMES)).toBe(1400);
    expect(applyPlacementCap(1800, PLACEMENT_GAMES + 50)).toBe(1800);
  });
});

it("keeps the placement ceiling inside the Gold band", () => {
  const gold = TIERS.find((t) => t.name === "Gold")!;
  const platinum = TIERS.find((t) => t.name === "Platinum")!;
  expect(PLACEMENT_RANK_CEILING).toBeGreaterThanOrEqual(gold.min);
  expect(PLACEMENT_RANK_CEILING).toBeLessThan(platinum.min); // never reaches Platinum
});
