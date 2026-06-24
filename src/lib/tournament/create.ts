import { prisma } from "@/lib/db";
import { generateSingleElim } from "@/lib/bracket/generate";

export async function createTournament(input: { name: string; slug: string; playerIds: string[] }) {
  if (input.playerIds.length < 2) throw new Error("need at least 2 players");
  const t = await prisma.tournament.create({
    data: { name: input.name, slug: input.slug, status: "ACTIVE", format: "SINGLE_ELIM" },
  });
  const seeds = generateSingleElim(input.playerIds);
  // create all bracket rows (Promise.all preserves array order → created[i] matches seeds[i])
  const created = await Promise.all(
    seeds.map((s) =>
      prisma.bracketMatch.create({
        data: {
          tournamentId: t.id, round: s.round, slotInRound: s.slotInRound,
          playerAId: s.playerAId ?? null, playerBId: s.playerBId ?? null,
        },
      })
    )
  );
  const idByLocal = new Map(seeds.map((s, i) => [s.localId, created[i].id]));
  await Promise.all(
    seeds.map((s, i) =>
      s.winnerNextLocalId
        ? prisma.bracketMatch.update({
            where: { id: created[i].id },
            data: { winnerNextMatchId: idByLocal.get(s.winnerNextLocalId), winnerNextSlot: s.winnerNextSlot },
          })
        : Promise.resolve(null)
    )
  );
  return t;
}
