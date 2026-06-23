import { describe, it, expect } from "vitest";
import { expectedScore } from "./expected";
import { updateRating } from "./update";
import { computePerf } from "./perf";

describe("expectedScore", () => {
  it("is 0.5 for equal ratings", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
  });
  it("favors the higher-rated side", () => {
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.5);
  });
});

describe("updateRating", () => {
  it("gains less for an expected win", () => {
    const fav = updateRating({ rating: 1400, opponentAvg: 1000, won: true, perf: 0 });
    const upset = updateRating({ rating: 1000, opponentAvg: 1400, won: true, perf: 0 });
    expect(upset.eloDelta).toBeGreaterThan(fav.eloDelta);
  });
  it("perf bonus moves the result", () => {
    const flat = updateRating({ rating: 1000, opponentAvg: 1000, won: true, perf: 0 });
    const carry = updateRating({ rating: 1000, opponentAvg: 1000, won: true, perf: 1 });
    expect(carry.eloAfter).toBeGreaterThan(flat.eloAfter);
  });
});

describe("computePerf", () => {
  it("rewards impostor kills, penalizes nothing missing", () => {
    const p = computePerf("IMPOSTOR", { kills: 3, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true });
    expect(p).toBeGreaterThan(0);
  });
  it("penalizes crew incorrect shots", () => {
    const good = computePerf("CREW", { kills: 0, correctShots: 1, incorrectShots: 0, tasksDone: 5, tasksTotal: 5, survived: true });
    const bad  = computePerf("CREW", { kills: 0, correctShots: 0, incorrectShots: 2, tasksDone: 1, tasksTotal: 5, survived: false });
    expect(good).toBeGreaterThan(bad);
  });
  it("stays within [-1,1]", () => {
    const p = computePerf("IMPOSTOR", { kills: 99, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true });
    expect(p).toBeLessThanOrEqual(1);
  });
});
