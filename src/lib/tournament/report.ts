import { prisma } from "@/lib/db";

export async function reportBracketResult(bracketMatchId: string, winnerId: string) {
  const current = await prisma.bracketMatch.findUnique({ where: { id: bracketMatchId } });
  if (!current) throw new Error("bracket match not found");
  if (current.winnerId) throw new Error("already reported");
  const node = await prisma.bracketMatch.update({ where: { id: bracketMatchId }, data: { winnerId } });
  if (node.winnerNextMatchId) {
    await prisma.bracketMatch.update({
      where: { id: node.winnerNextMatchId },
      data: node.winnerNextSlot === "TOP" ? { playerAId: winnerId } : { playerBId: winnerId },
    });
  } else {
    await prisma.tournament.update({ where: { id: node.tournamentId }, data: { status: "COMPLETE" } });
  }
  return node;
}
