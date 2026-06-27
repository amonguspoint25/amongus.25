import { describe, it, expect } from "vitest";
import { softResetSeed, SOFT_RESET_FACTOR } from "./softReset";

describe("softResetSeed", () => {
  it("seeds a brand-new player at the 1000 baseline", () => {
    expect(softResetSeed(null)).toBe(1000);
    expect(softResetSeed(undefined)).toBe(1000);
  });
  it("pulls a returning player halfway toward 1000 (factor 0.5)", () => {
    expect(softResetSeed(1480)).toBe(1240); // 1000 + 480*0.5
    expect(softResetSeed(800)).toBe(900); // 1000 + (-200)*0.5
    expect(softResetSeed(1000)).toBe(1000);
  });
  it("respects a custom factor", () => {
    expect(softResetSeed(1480, 0.7)).toBe(1336); // 1000 + 480*0.7
    expect(SOFT_RESET_FACTOR).toBe(0.5);
  });
});
