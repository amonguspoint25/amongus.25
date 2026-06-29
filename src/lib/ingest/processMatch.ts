import { prisma } from "../db";
import { computePerf } from "../elo/perf";
import { updateRating } from "../elo/update";
import { kForGames, applyPlacementCap } from "../elo/placement";
import type { MatchPayload } from "./schema";
import { Prisma } from "@prisma/client";
import { getOrCreateActiveSeason, getOrCreatePlayerSeason } from "../season/season";

// NOTE: Deeper anti-cheat (HMAC-signed match assertions, nonce, timing-sanity on match
// duration) is DEFERRED BY DESIGN to the game-server ingestion contract. The website
// trusts the bearer-authenticated custom server as the source of truth; per-event
// cryptographic signing belongs to that server's spec (a separate future project).

export type MatchResult = {
  playerId: string;
  name: string;
  role: "CREW" | "IMPOSTOR";
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
};

export async function processMatch(payload: MatchPayload): Promise<{ matchId: string; results: MatchResult[] }> {
  // Idempotency: short-circuit if this matchCode was already processed.
  const existing = await prisma.match.findUnique({ where: { code: payload.matchCode } });
  if (existing) return { matchId: existing.id, results: [] };

  const playerIds = payload.participants.map((p) => p.playerId);
  const players = await prisma.player.findMany({
    where: { isLinked: true, id: { in: playerIds } },
  });
  const byId = new Map(players.map((p) => [p.id, p]));

  const rows = payload.participants
    .map((p) => ({ p, player: byId.get(p.playerId) }))
    .filter((r): r is { p: typeof r.p; player: NonNullable<typeof r.player> } => !!r.player);

  // Defensive: if dropping unlinked players left a whole role empty, the match is incomplete — don't
  // record a one-role match (our plugin already refuses to send these; this guards other clients).
  if (!rows.some((r) => r.p.role === "CREW") || !rows.some((r) => r.p.role === "IMPOSTOR")) {
    return { matchId: "", results: [] };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const season = await getOrCreateActiveSeason(tx);

      // Lazily materialize each player's season rating (soft-reset seeded on first use).
      const seasonByPlayer = new Map<string, Awaited<ReturnType<typeof getOrCreatePlayerSeason>>>();
      for (const { player } of rows) {
        seasonByPlayer.set(player.id, await getOrCreatePlayerSeason(tx, player.id, season));
      }

      // Averages come from SEASON ratings — the competitive ladder for this match. Exclude
      // disconnected players so a leaver's rating never skews anyone else's delta (matches the
      // "disconnected players don't affect others" contract). If a whole role is all-disconnected,
      // avg([]) falls back to the neutral 1000.
      const crewAvg = avg(rows.filter((r) => r.p.role === "CREW" && !r.p.disconnected).map((r) => seasonByPlayer.get(r.player.id)!.crewElo));
      const impAvg = avg(rows.filter((r) => r.p.role === "IMPOSTOR" && !r.p.disconnected).map((r) => seasonByPlayer.get(r.player.id)!.impElo));

      const match = await tx.match.create({
        data: {
          code: payload.matchCode,
          map: payload.map,
          startedAt: new Date(payload.startedAt),
          endedAt: new Date(payload.endedAt),
          outcome: payload.outcome,
          seasonId: season.id,
        },
      });

      const results: MatchResult[] = [];

      for (const { p, player } of rows) {
        const ps = seasonByPlayer.get(player.id)!;
        const isImp = p.role === "IMPOSTOR";
        const rating = isImp ? ps.impElo : ps.crewElo;

        // Disconnected player: recorded in the match for history, but ELO is nullified (no gain/loss)
        // and the game does NOT count toward their stats. Everyone else still scores normally.
        if (p.disconnected === true) {
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
              roundsSurvived: p.roundsSurvived ?? 0,
              eloBefore: rating,
              eloAfter: rating,
              eloDelta: 0,
            },
          });
          results.push({ playerId: player.id, name: player.displayName, role: p.role, eloBefore: rating, eloAfter: rating, eloDelta: 0 });
          continue;
        }

        const opponentAvg = isImp ? crewAvg : impAvg;
        const perf = computePerf(p.role, p);
        const roleGames = isImp ? ps.impGames : ps.crewGames; // per-season placement
        const k = kForGames(roleGames);
        const raw = updateRating({ rating, opponentAvg, won: p.won, perf, k });
        // Placement Gold cap: while provisional, hold the rating at most Gold (recompute the
        // delta so eloBefore + eloDelta == eloAfter stays consistent).
        const eloAfter = applyPlacementCap(raw.eloAfter, roleGames);
        const eloDelta = eloAfter - rating;

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
            roundsSurvived: p.roundsSurvived ?? 0,
            eloBefore: rating,
            eloAfter,
            eloDelta,
          },
        });

        results.push({ playerId: player.id, name: player.displayName, role: p.role, eloBefore: rating, eloAfter, eloDelta });

        // Season rating + per-season counts (the leaderboard for this season).
        const psCrew = isImp ? ps.crewElo : eloAfter;
        const psImp = isImp ? eloAfter : ps.impElo;
        await tx.playerSeason.update({
          where: { id: ps.id },
          data: {
            crewElo: psCrew,
            impElo: psImp,
            overallElo: (psCrew + psImp) / 2,
            kills: { increment: p.kills },
            correctShots: { increment: p.correctShots },
            incorrectShots: { increment: p.incorrectShots },
            tasksDone: { increment: p.tasksDone },
            crewWins: { increment: !isImp && p.won ? 1 : 0 },
            impWins: { increment: isImp && p.won ? 1 : 0 },
            games: { increment: 1 },
            crewGames: { increment: isImp ? 0 : 1 },
            impGames: { increment: isImp ? 1 : 0 },
          },
        });

        // Player lifetime counters + cumulative career Elo (the all-time board). Apply the same
        // placement cap so a provisional player's all-time rank is also held at most Gold.
        const careerCrew = isImp ? player.crewElo : applyPlacementCap(player.crewElo + eloDelta, roleGames);
        const careerImp = isImp ? applyPlacementCap(player.impElo + eloDelta, roleGames) : player.impElo;
        await tx.player.update({
          where: { id: player.id },
          data: {
            crewElo: careerCrew,
            impElo: careerImp,
            overallElo: (careerCrew + careerImp) / 2,
            kills: { increment: p.kills },
            correctShots: { increment: p.correctShots },
            incorrectShots: { increment: p.incorrectShots },
            tasksDone: { increment: p.tasksDone },
            crewWins: { increment: !isImp && p.won ? 1 : 0 },
            impWins: { increment: isImp && p.won ? 1 : 0 },
            games: { increment: 1 },
            crewGames: { increment: isImp ? 0 : 1 },
            impGames: { increment: isImp ? 1 : 0 },
          },
        });
      }
      return { matchId: match.id, results };
    });
  } catch (error) {
    // Handle a race where two concurrent requests both pass the idempotency check
    // and one loses to the unique constraint on Match.code (Prisma error P2002).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.match.findUnique({ where: { code: payload.matchCode } });
      if (raced) return { matchId: raced.id, results: [] };
    }
    throw error;
  }
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1000;
}
