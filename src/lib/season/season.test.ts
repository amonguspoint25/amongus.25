import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason, getOrCreatePlayerSeason, rolloverSeason } from "./season";

let userId: string;
let playerId: string;
let s1Id: string | undefined;
let s2Id: string | undefined;

beforeAll(async () => {
  const u = await prisma.user.create({ data: { discordId: `test-season-${Date.now()}`, username: "t" } });
  const p = await prisma.player.create({ data: { userId: u.id, displayName: "Seasoner" } });
  userId = u.id; playerId = p.id;
});

afterAll(async () => {
  await prisma.playerSeason.deleteMany({ where: { playerId } });
  await prisma.player.delete({ where: { id: playerId } });
  await prisma.user.delete({ where: { id: userId } });
  const seasonIds = [s1Id, s2Id].filter((id): id is string => id !== undefined);
  if (seasonIds.length) await prisma.season.deleteMany({ where: { id: { in: seasonIds } } });
});

describe("season helpers", () => {
  it("creates a season-1 row at 1000, then soft-resets into the next season", async () => {
    const s1 = await getOrCreateActiveSeason(prisma);
    s1Id = s1.id;
    const ps1 = await getOrCreatePlayerSeason(prisma, playerId, s1);
    expect(ps1.overallElo).toBe(1000);

    // Simulate a strong season 1 finish.
    await prisma.playerSeason.update({ where: { id: ps1.id }, data: { overallElo: 1480, crewElo: 1480, impElo: 1480 } });

    const s2 = await rolloverSeason(prisma);
    s2Id = s2.id;
    expect(s2.number).toBe(s1.number + 1);
    const ps2 = await getOrCreatePlayerSeason(prisma, playerId, s2);
    expect(ps2.overallElo).toBe(1240); // 1000 + 480*0.5
  });
});
