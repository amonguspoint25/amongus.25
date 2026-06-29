import { describe, it, expect } from "vitest";
import { leaderboardEmbed, rankEmbed, lastMatchEmbed, tiersEmbed, matchAnnounceEmbed } from "./embeds";
import type { LeaderboardRow } from "@/lib/leaderboard";

const row = (name: string, overallElo: number, games = 25): LeaderboardRow => ({
  id: name, name, crewElo: overallElo, impElo: overallElo, overallElo, games, gamesInRole: games, needed: 10,
});

describe("leaderboardEmbed", () => {
  it("lists ranked players and counts provisional", () => {
    const e = leaderboardEmbed("overall", [row("Alice", 1300), row("Bob", 1200)], [row("New", 1000, 2)]);
    expect(e.title).toContain("Leaderboard");
    expect(e.description).toContain("Alice");
    expect(e.description).toContain("Bob");
    expect(e.footer.text).toContain("1 player");
  });
  it("handles an empty board", () => {
    const e = leaderboardEmbed("crew", [], []);
    expect(e.description.toLowerCase()).toContain("no ranked players");
  });
});

describe("rankEmbed", () => {
  const base = { displayName: "Zoe", crewElo: 1100, impElo: 1300, overallElo: 1200, crewWins: 6, impWins: 4, kills: 12 };
  it("shows the tier for a ranked player", () => {
    const e = rankEmbed({ ...base, games: 25 });
    expect(e.title).toBe("Zoe");
    expect(e.description).toContain("Tier");
    expect(e.thumbnail.url).toContain("/media/tier-");
    expect(e.fields.find((f) => f.name === "Win rate")!.value).toBe("40%");
  });
  it("shows PROVISIONAL with placement progress for a new player", () => {
    const e = rankEmbed({ ...base, games: 3 });
    expect(e.description).toContain("PROVISIONAL");
    expect(e.description).toContain("3/10");
  });
});

describe("lastMatchEmbed", () => {
  it("renders a win in green with the ELO delta", () => {
    const e = lastMatchEmbed({
      playerName: "Mo", role: "IMPOSTOR", won: true, eloDelta: 18.6,
      outcome: "IMP_WIN", map: "Polus", startedAt: new Date("2026-06-29T00:00:00Z"),
    });
    expect(e.color).toBe(0x57f287);
    expect(e.description).toContain("+19");
    expect(e.description).toContain("Impostor");
  });
});

describe("tiersEmbed", () => {
  it("includes the top and bottom tiers", () => {
    const e = tiersEmbed();
    expect(e.description).toContain("Mastermind");
    expect(e.description).toContain("Wood");
    expect(e.description).toContain("1750"); // Mastermind threshold
  });
});

describe("matchAnnounceEmbed", () => {
  it("titles by outcome and lists per-player deltas, winners first", () => {
    const e = matchAnnounceEmbed("CREW_WIN", "Polus", [
      { name: "Loser", role: "IMPOSTOR", eloDelta: -12.2 },
      { name: "Winner", role: "CREW", eloDelta: 9.7 },
    ]);
    expect(e.title).toContain("Crew win");
    expect(e.description.indexOf("Winner")).toBeLessThan(e.description.indexOf("Loser"));
    expect(e.description).toContain("+10");
    expect(e.description).toContain("-12");
  });
});
