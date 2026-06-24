import { prisma } from "@/lib/db";

/** Record a bracket match winner and advance them into the next round's slot. */
export async function reportBracketResult(bracketMatchId: string, winnerId: string) {
  const node = await prisma.bracketMatch.update({
    where: { id: bracketMatchId }, data: { winnerId },
  });
  if (node.winnerNextMatchId) {
    await prisma.bracketMatch.update({
      where: { id: node.winnerNextMatchId },
      data: node.winnerNextSlot === "TOP" ? { playerAId: winnerId } : { playerBId: winnerId },
    });
  } else {
    // No next match → this was the final. Mark the tournament complete.
    await prisma.tournament.update({ where: { id: node.tournamentId }, data: { status: "COMPLETE" } });
  }
  return node;
}
