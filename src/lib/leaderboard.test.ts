import { describe, it, expect } from "vitest";
import { partitionProvisional, gamesInRoleFor, type PlayerRow } from "./leaderboard";

function row(over: Partial<PlayerRow>): PlayerRow {
  return { id: "x", name: "x", crewElo: 1000, impElo: 1000, overallElo: 1000, games: 0, crewGames: 0, impGames: 0, ...over };
}

describe("gamesInRoleFor", () => {
  it("selects the role-relevant counter", () => {
    const r = row({ games: 30, crewGames: 12, impGames: 3 });
    expect(gamesInRoleFor(r, "overall")).toBe(30);
    expect(gamesInRoleFor(r, "crew")).toBe(12);
    expect(gamesInRoleFor(r, "imp")).toBe(3);
  });
});

describe("partitionProvisional", () => {
  it("splits ranked vs provisional by the active role and keeps ranked input order", () => {
    const rows = [
      row({ id: "a", name: "A", crewElo: 1200, crewGames: 15 }),
      row({ id: "b", name: "B", crewElo: 1100, crewGames: 4 }),
      row({ id: "c", name: "C", crewElo: 1050, crewGames: 20 }),
    ];
    const { ranked, provisional } = partitionProvisional(rows, "crew");
    expect(ranked.map((r) => r.id)).toEqual(["a", "c"]);
    expect(provisional.map((r) => r.id)).toEqual(["b"]);
    expect(provisional[0].gamesInRole).toBe(4);
    expect(provisional[0].needed).toBe(10);
  });

  it("orders provisional by progress (closest to qualifying first), then ELO", () => {
    const rows = [
      row({ id: "p1", name: "P1", impElo: 980, impGames: 3 }),
      row({ id: "p2", name: "P2", impElo: 1040, impGames: 7 }),
      row({ id: "p3", name: "P3", impElo: 1010, impGames: 7 }),
    ];
    const { provisional } = partitionProvisional(rows, "imp");
    // 7 games before 3 games; within 7, higher imp ELO first.
    expect(provisional.map((r) => r.id)).toEqual(["p2", "p3", "p1"]);
  });
});
