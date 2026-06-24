import { prisma } from "../db";
import { computePerf } from "../elo/perf";
import { updateRating } from "../elo/update";
import type { MatchPayload } from "./schema";
import { Prisma } from "@prisma/client";

// NOTE: Deeper anti-cheat (HMAC-signed match assertions, nonce, timing-sanity on match
// duration) is DEFERRED BY DESIGN to the game-server ingestion contract. The website
// trusts the bearer-authenticated custom server as the source of truth; per-event
// cryptographic signing belongs to that server's spec (a separate future project).

export async function processMatch(payload: MatchPayload): Promise<{ matchId: string }> {
  // Idempotency: short-circuit if this matchCode was already processed.
  const existing = await prisma.match.findUnique({ where: { code: payload.matchCode } });
  if (existing) return { matchId: existing.id };

  const discordIds = payload.participants.map((p) => p.discordId);
  const players = await prisma.player.findMany({
    where: { isLinked: true, user: { discordId: { in: discordIds } } },
    include: { user: true },
  });
  const byDiscord = new Map(players.map((p) => [p.user.discordId, p]));

  const rows = payload.participants
    .map((p) => ({ p, player: byDiscord.get(p.discordId) }))
    .filter((r): r is { p: typeof r.p; player: NonNullable<typeof r.player> } => !!r.player);

  const crewAvg = avg(rows.filter((r) => r.p.role === "CREW").map((r) => r.player.crewElo));
  const impAvg = avg(rows.filter((r) => r.p.role === "IMPOSTOR").map((r) => r.player.impElo));

  try {
    return await prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          code: payload.matchCode,
          map: payload.map,
          startedAt: new Date(payload.startedAt),
          endedAt: new Date(payload.endedAt),
          outcome: payload.outcome,
        },
      });
      for (const { p, player } of rows) {
        const isImp = p.role === "IMPOSTOR";
        const rating = isImp ? player.impElo : player.crewElo;
        const opponentAvg = isImp ? crewAvg : impAvg;
        const perf = computePerf(p.role, p);
        const { eloAfter, eloDelta } = updateRating({ rating, opponentAvg, won: p.won, perf });
        await tx.matchParticipant.create({
          data: {
            matchId: match.id,
            playerId: player.id,
            role: p.role,
            won: p.won,
            kills: p.kills,
            correctShots: p.correctShots,
            incorrectShots: p.incorrectShots,
            tasksDone: p.tasksDone,
            tasksTotal: p.tasksTotal,
            timeToTaskMs: p.timeToTaskMs,
            timeToKillMs: p.timeToKillMs,
            survived: p.survived,
            eloBefore: rating,
            eloAfter,
            eloDelta,
          },
        });
        const newCrew = isImp ? player.crewElo : eloAfter;
        const newImp = isImp ? eloAfter : player.impElo;
        await tx.player.update({
          where: { id: player.id },
          data: {
            crewElo: newCrew,
            impElo: newImp,
            overallElo: (newCrew + newImp) / 2,
            kills: { increment: p.kills },
            correctShots: { increment: p.correctShots },
            incorrectShots: { increment: p.incorrectShots },
            tasksDone: { increment: p.tasksDone },
            crewWins: { increment: !isImp && p.won ? 1 : 0 },
            impWins: { increment: isImp && p.won ? 1 : 0 },
            games: { increment: 1 },
          },
        });
      }
      return { matchId: match.id };
    });
  } catch (error) {
    // Handle a race where two concurrent requests both pass the idempotency check
    // and one loses to the unique constraint on Match.code (Prisma error P2002).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.match.findUnique({ where: { code: payload.matchCode } });
      if (raced) return { matchId: raced.id };
    }
    throw error;
  }
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1000;
}
