import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../db";
import { createTournament } from "./create";
import { reportBracketResult } from "./report";

async function makePlayer(name: string) {
  const u = await prisma.user.create({ data: { discordId: "t-" + name, username: name } });
  return prisma.player.create({ data: { userId: u.id, displayName: name, linkCode: "T-" + name } });
}

describe("tournament create + report", () => {
  beforeEach(async () => {
    await prisma.bracketMatch.deleteMany();
    await prisma.tournament.deleteMany();
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
  });

  it("creates 3 bracket matches for 4 players and advances a winner", async () => {
    const ps = [];
    for (const n of ["A", "B", "C", "D"]) ps.push(await makePlayer(n));
    const ids = ps.map((p) => p.id);

    const t = await createTournament({ name: "Cup", slug: "cup", playerIds: ids });
    const bracket = await prisma.bracketMatch.findMany({ where: { tournamentId: t.id } });
    expect(bracket.length).toBe(3);

    const round1 = bracket.filter((b) => b.round === 1);
    expect(round1.length).toBe(2);
    const finals = bracket.find((b) => b.round === 2)!;
    expect(finals).toBeTruthy();

    // report the first round-1 match's playerA as winner → they appear in the finals
    const m = round1[0];
    await reportBracketResult(m.id, m.playerAId!);
    const updatedFinals = await prisma.bracketMatch.findUnique({ where: { id: finals.id } });
    const seated = [updatedFinals!.playerAId, updatedFinals!.playerBId];
    expect(seated).toContain(m.playerAId);
  });
});
