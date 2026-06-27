import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { processMatch } from "./processMatch";
import type { MatchPayload } from "./schema";

const TAG = `pm-season-${Date.now()}`;
async function linkedPlayer(name: string) {
  const u = await prisma.user.create({ data: { discordId: `${TAG}-${name}`, username: name } });
  const p = await prisma.player.create({ data: { userId: u.id, displayName: name, isLinked: true } });
  return { userId: u.id, playerId: p.id, discordId: u.discordId };
}

afterAll(async () => {
  await prisma.matchParticipant.deleteMany({ where: { player: { user: { discordId: { startsWith: TAG } } } } });
  await prisma.match.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.playerSeason.deleteMany({ where: { player: { user: { discordId: { startsWith: TAG } } } } });
  await prisma.player.deleteMany({ where: { user: { discordId: { startsWith: TAG } } } });
  await prisma.user.deleteMany({ where: { discordId: { startsWith: TAG } } });
});

it("attributes a match to the active season and seeds PlayerSeason at 1000", async () => {
  const a = await linkedPlayer("Imp"); const b = await linkedPlayer("Crew");
  const payload: MatchPayload = {
    matchCode: `${TAG}-m1`, startedAt: new Date(Date.now() - 600000).toISOString(),
    endedAt: new Date().toISOString(), outcome: "IMP_WIN",
    participants: [
      { discordId: a.discordId, role: "IMPOSTOR", won: true, kills: 2, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
      { discordId: b.discordId, role: "CREW", won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 3, tasksTotal: 5, survived: false },
    ],
  };
  const { matchId } = await processMatch(payload);
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  expect(match?.seasonId).toBeTruthy();

  const ps = await prisma.playerSeason.findFirst({ where: { playerId: a.playerId } });
  expect(ps?.games).toBe(1);
  expect(ps?.impWins).toBe(1);
  expect(ps?.impElo).toBeGreaterThan(1000); // won → season rating rose from the 1000 seed
});
