import { prisma } from "@/lib/db";
import { generateSingleElim } from "@/lib/bracket/generate";

export async function createTournament(input: { name: string; slug: string; playerIds: string[] }) {
  if (input.playerIds.length < 2) throw new Error("need at least 2 players");
  const seeds = generateSingleElim(input.playerIds);
  // Atomic: the tournament and its full bracket are created together, so a
  // mid-creation failure can never leave an orphaned half-bracket. Sequential
  // awaits (not Promise.all) because interactive transactions run on one
  // connection and don't support concurrent queries.
  return prisma.$transaction(async (tx) => {
    const t = await tx.tournament.create({
      data: { name: input.name, slug: input.slug, status: "ACTIVE", format: "SINGLE_ELIM" },
    });
    const idByLocal = new Map<string, string>();
    const createdIds: string[] = [];
    for (const s of seeds) {
      const bm = await tx.bracketMatch.create({
        data: {
          tournamentId: t.id, round: s.round, slotInRound: s.slotInRound,
          playerAId: s.playerAId ?? null, playerBId: s.playerBId ?? null,
        },
      });
      idByLocal.set(s.localId, bm.id);
      createdIds.push(bm.id);
    }
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      if (s.winnerNextLocalId) {
        await tx.bracketMatch.update({
          where: { id: createdIds[i] },
          data: { winnerNextMatchId: idByLocal.get(s.winnerNextLocalId), winnerNextSlot: s.winnerNextSlot },
        });
      }
    }
    return t;
  });
}
