import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../db";
import { processMatch } from "./processMatch";
import { recomputeAll } from "./recompute";

async function makePlayer(name: string) {
  const user = await prisma.user.create({ data: { discordId: name, username: name } });
  return prisma.player.create({ data: { userId: user.id, displayName: name, linkCode: name + "-c", isLinked: true } });
}

function match(code: string, impId: string, crewId: string) {
  return {
    matchCode: code, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
    outcome: "IMP_WIN" as const,
    participants: [
      { playerId: impId, role: "IMPOSTOR" as const, won: true, kills: 2, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
      { playerId: crewId, role: "CREW" as const, won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 2, tasksTotal: 5, survived: false },
    ],
  };
}

async function snapshot() {
  const players = await prisma.player.findMany({ orderBy: { id: "asc" } });
  return players.map((p) => ({ id: p.id, crewElo: p.crewElo, impElo: p.impElo, overallElo: p.overallElo, games: p.games }));
}

describe("recomputeAll", () => {
  beforeEach(async () => {
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.playerSeason.deleteMany();
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
    await prisma.season.deleteMany();
  });

  it("is a no-op when nothing is voided (recompute reproduces live ratings exactly)", async () => {
    const a = await makePlayer("rc-a");
    const b = await makePlayer("rc-b");
    await processMatch(match("RC1", a.id, b.id));
    await processMatch(match("RC2", b.id, a.id)); // swap roles
    const before = await snapshot();

    await prisma.$transaction((tx) => recomputeAll(tx));

    const after = await snapshot();
    for (let i = 0; i < before.length; i++) {
      expect(after[i].crewElo).toBeCloseTo(before[i].crewElo, 6);
      expect(after[i].impElo).toBeCloseTo(before[i].impElo, 6);
      expect(after[i].overallElo).toBeCloseTo(before[i].overallElo, 6);
      expect(after[i].games).toBe(before[i].games);
    }
  }, 30_000);

  it("voiding all matches resets every player to the 1000 baseline", async () => {
    const a = await makePlayer("rc-c");
    const b = await makePlayer("rc-d");
    await processMatch(match("RC3", a.id, b.id));
    await processMatch(match("RC4", a.id, b.id));

    await prisma.$transaction(async (tx) => {
      await tx.match.updateMany({ data: { voided: true } });
      await recomputeAll(tx);
    });

    for (const id of [a.id, b.id]) {
      const p = await prisma.player.findUnique({ where: { id } });
      expect(p!.crewElo).toBeCloseTo(1000, 6);
      expect(p!.impElo).toBeCloseTo(1000, 6);
      expect(p!.games).toBe(0);
    }
  }, 30_000);

  it("void then un-void round-trips back to the original ratings", async () => {
    const a = await makePlayer("rc-e");
    const b = await makePlayer("rc-f");
    const m1 = await processMatch(match("RC5", a.id, b.id));
    await processMatch(match("RC6", a.id, b.id));
    const before = await snapshot();

    // Void the first match (drops a's win + b's loss for that game) and recompute.
    await prisma.$transaction(async (tx) => {
      await tx.match.update({ where: { id: m1.matchId }, data: { voided: true } });
      await recomputeAll(tx);
    });
    const voided = await snapshot();
    expect(voided.find((p) => p.id === a.id)!.games).toBe(1); // only RC6 counts now
    // a still won RC1 -> voiding it should lower a's impostor rating vs. the 2-win snapshot.
    expect(voided.find((p) => p.id === a.id)!.impElo).toBeLessThan(before.find((p) => p.id === a.id)!.impElo);

    // Un-void and recompute -> identical to the original 2-match state.
    await prisma.$transaction(async (tx) => {
      await tx.match.update({ where: { id: m1.matchId }, data: { voided: false } });
      await recomputeAll(tx);
    });
    const restored = await snapshot();
    for (let i = 0; i < before.length; i++) {
      expect(restored[i].impElo).toBeCloseTo(before[i].impElo, 6);
      expect(restored[i].crewElo).toBeCloseTo(before[i].crewElo, 6);
      expect(restored[i].games).toBe(before[i].games);
    }
  }, 30_000);
});
