import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../db";
import { processMatch } from "./processMatch";

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
});
