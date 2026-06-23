import { describe, it, expect } from "vitest";
import { generateSingleElim } from "./generate";
describe("generateSingleElim", () => {
  it("creates n-1 matches for n players (power of two)", () => {
    const ms = generateSingleElim(["a","b","c","d"]);
    expect(ms.length).toBe(3);
  });
  it("round 1 holds all players", () => {
    const ms = generateSingleElim(["a","b","c","d"]);
    const r1 = ms.filter((m) => m.round === 1);
    const seated = r1.flatMap((m) => [m.playerAId, m.playerBId]).filter(Boolean);
    expect(seated.sort()).toEqual(["a","b","c","d"]);
  });
  it("round 1 winners point into round 2 slots", () => {
    const ms = generateSingleElim(["a","b","c","d"]);
    const r1 = ms.filter((m) => m.round === 1);
    expect(r1.every((m) => m.winnerNextLocalId)).toBe(true);
  });
});
