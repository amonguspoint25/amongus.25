import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../db";
import { processMatch } from "./processMatch";
import { computePerf } from "../elo/perf";
import { updateRating } from "../elo/update";

async function makePlayer(discordId: string) {
  const user = await prisma.user.create({ data: { discordId, username: discordId } });
  return prisma.player.create({ data: { userId: user.id, displayName: discordId, linkCode: discordId + "-c", isLinked: true } });
}

describe("processMatch", () => {
  beforeEach(async () => {
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
  });

  it("updates impostor rating up on a win and writes a match", async () => {
    const imp = await makePlayer("imp1");
    await makePlayer("crew1");
    const res = await processMatch({
      matchCode: "T1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: "IMP_WIN",
      participants: [
        { discordId: "imp1", role: "IMPOSTOR", won: true, kills: 3, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true, timeToKillMs: 15000 },
        { discordId: "crew1", role: "CREW", won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 1, tasksTotal: 5, survived: false },
      ],
    });
    expect(res.matchId).toBeTruthy();
    const updated = await prisma.player.findUnique({ where: { id: imp.id } });
    expect(updated!.impElo).toBeGreaterThan(1000);
    expect(updated!.impWins).toBe(1);
  });

  it("is idempotent: calling processMatch twice with the same matchCode returns the same matchId and increments games only once", async () => {
    const imp = await makePlayer("imp-idem");
    await makePlayer("crew-idem");
    const payload = {
      matchCode: "IDEM-1",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      outcome: "IMP_WIN" as const,
      participants: [
        { discordId: "imp-idem", role: "IMPOSTOR" as const, won: true, kills: 1, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
        { discordId: "crew-idem", role: "CREW" as const, won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 2, tasksTotal: 5, survived: false },
      ],
    };

    const first = await processMatch(payload);
    const second = await processMatch(payload);

    // Both calls return the same matchId
    expect(first.matchId).toBeTruthy();
    expect(second.matchId).toBe(first.matchId);

    // Player's games count is incremented only once
    const updated = await prisma.player.findUnique({ where: { id: imp.id } });
    expect(updated!.games).toBe(1);
  });

  it("increments only the played role's counter (and total games)", async () => {
    const imp = await makePlayer("imp-roles");
    const crew = await makePlayer("crew-roles");
    await processMatch({
      matchCode: "ROLES-1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: "IMP_WIN",
      participants: [
        { discordId: "imp-roles", role: "IMPOSTOR", won: true, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
        { discordId: "crew-roles", role: "CREW", won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 1, tasksTotal: 5, survived: false },
      ],
    });
    const i = await prisma.player.findUnique({ where: { id: imp.id } });
    const c = await prisma.player.findUnique({ where: { id: crew.id } });
    expect(i!.impGames).toBe(1);
    expect(i!.crewGames).toBe(0);
    expect(i!.games).toBe(1);
    expect(c!.crewGames).toBe(1);
    expect(c!.impGames).toBe(0);
  });

  it("applies the placement K-factor (64) for a player's first game in a role", async () => {
    await makePlayer("imp-k");
    await makePlayer("crew-k");
    const res = await processMatch({
      matchCode: "K-1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: "IMP_WIN",
      participants: [
        { discordId: "imp-k", role: "IMPOSTOR", won: true, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
        { discordId: "crew-k", role: "CREW", won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 1, tasksTotal: 5, survived: false },
      ],
    });
    // Both players start at 1000, so the impostor's opponentAvg is 1000.
    const perf = computePerf("IMPOSTOR", { kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true });
    const expected = updateRating({ rating: 1000, opponentAvg: 1000, won: true, perf, k: 64 });
    const mp = await prisma.matchParticipant.findFirst({ where: { match: { code: "K-1" }, role: "IMPOSTOR" } });
    expect(mp!.eloDelta).toBeCloseTo(expected.eloDelta, 5);
    expect(res.matchId).toBeTruthy();
  });
});
