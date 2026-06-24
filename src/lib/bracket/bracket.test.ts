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
  it("distributes byes for a 6-player field with no empty-vs-empty match", () => {
    const ms = generateSingleElim(["a","b","c","d","e","f"]);
    const r1 = ms.filter((m) => m.round === 1);
    expect(r1.length).toBe(4);
    // every round-1 match has at least playerA; none is empty-vs-empty
    expect(r1.every((m) => !!m.playerAId)).toBe(true);
    // exactly 2 byes (8 - 6), i.e. 2 matches missing playerB
    expect(r1.filter((m) => !m.playerBId).length).toBe(2);
  });
});
