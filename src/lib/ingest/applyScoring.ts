import type { Prisma, Season } from "@prisma/client";
import { computePerf } from "../elo/perf";
import { updateRating } from "../elo/update";
import { kForGames, applyPlacementCap } from "../elo/placement";
import { getOrCreatePlayerSeason } from "../season/season";

// One participant's scoring inputs — sourced from the ingest payload (live) or from the
// stored MatchParticipant row (recompute). `disconnected` MUST be carried so the recompute
// reproduces the DC-nullify behaviour.
export type ScoringPart = {
  playerId: string;
  role: "CREW" | "IMPOSTOR";
  won: boolean;
  kills: number;
  correctShots: number;
  incorrectShots: number;
  tasksDone: number;
  tasksTotal: number;
  timeToTaskMs?: number | null;
  timeToKillMs?: number | null;
  survived: boolean;
  roundsSurvived: number;
  disconnected: boolean;
};

export type MatchResult = {
  playerId: string;
  name: string;
  role: "CREW" | "IMPOSTOR";
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
};

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1000;
}

// Applies ONE match's ELO effects to PlayerSeason + Player and writes its MatchParticipant rows.
// Single source of truth for the rating math: called by live ingest (processMatch) and by the
// void recompute. The MatchParticipant rows are upserted, so recompute updates them in place.
// Caller guarantees the match has both roles and that every part's player exists + is linked.
export async function applyMatchScoring(
  tx: Prisma.TransactionClient,
  season: Season,
  matchId: string,
  parts: ScoringPart[],
): Promise<MatchResult[]> {
  const seasonByPlayer = new Map<string, Awaited<ReturnType<typeof getOrCreatePlayerSeason>>>();
  for (const p of parts) {
    seasonByPlayer.set(p.playerId, await getOrCreatePlayerSeason(tx, p.playerId, season));
  }

  // Opponent strength = average SEASON rating of the OTHER role, excluding disconnected leavers.
  const crewAvg = avg(parts.filter((p) => p.role === "CREW" && !p.disconnected).map((p) => seasonByPlayer.get(p.playerId)!.crewElo));
  const impAvg = avg(parts.filter((p) => p.role === "IMPOSTOR" && !p.disconnected).map((p) => seasonByPlayer.get(p.playerId)!.impElo));

  const results: MatchResult[] = [];

  for (const p of parts) {
    const ps = seasonByPlayer.get(p.playerId)!;
    const isImp = p.role === "IMPOSTOR";
    const rating = isImp ? ps.impElo : ps.crewElo;
    const roleGames = isImp ? ps.impGames : ps.crewGames; // per-season placement count (pre-increment)
    const player = await tx.player.findUniqueOrThrow({ where: { id: p.playerId } });

    let eloAfter = rating;
    let eloDelta = 0;
    if (!p.disconnected) {
      const opponentAvg = isImp ? crewAvg : impAvg;
      const perf = computePerf(p.role, {
        kills: p.kills, correctShots: p.correctShots, incorrectShots: p.incorrectShots,
        tasksDone: p.tasksDone, tasksTotal: p.tasksTotal,
        timeToTaskMs: p.timeToTaskMs ?? undefined, timeToKillMs: p.timeToKillMs ?? undefined,
        survived: p.survived, roundsSurvived: p.roundsSurvived,
      });
      const raw = updateRating({ rating, opponentAvg, won: p.won, perf, k: kForGames(roleGames) });
      eloAfter = applyPlacementCap(raw.eloAfter, roleGames); // hold provisional players at Gold
      eloDelta = eloAfter - rating;
    }

    // Upsert the participant row — create on live ingest, update in place on recompute.
    const data = {
      matchId, playerId: p.playerId, role: p.role as Prisma.MatchParticipantCreateManyInput["role"], won: p.won,
      kills: p.kills, correctShots: p.correctShots, incorrectShots: p.incorrectShots,
      tasksDone: p.tasksDone, tasksTotal: p.tasksTotal,
      timeToTaskMs: p.timeToTaskMs ?? null, timeToKillMs: p.timeToKillMs ?? null,
      survived: p.survived, roundsSurvived: p.roundsSurvived, disconnected: p.disconnected,
      eloBefore: rating, eloAfter, eloDelta,
    };
    const existing = await tx.matchParticipant.findFirst({ where: { matchId, playerId: p.playerId } });
    if (existing) await tx.matchParticipant.update({ where: { id: existing.id }, data });
    else await tx.matchParticipant.create({ data });

    results.push({ playerId: p.playerId, name: player.displayName, role: p.role, eloBefore: rating, eloAfter, eloDelta });

    if (p.disconnected) continue; // DC: history only — no rating/stat changes

    const psCrew = isImp ? ps.crewElo : eloAfter;
    const psImp = isImp ? eloAfter : ps.impElo;
    await tx.playerSeason.update({
      where: { id: ps.id },
      data: {
        crewElo: psCrew, impElo: psImp, overallElo: (psCrew + psImp) / 2,
        kills: { increment: p.kills }, correctShots: { increment: p.correctShots },
        incorrectShots: { increment: p.incorrectShots }, tasksDone: { increment: p.tasksDone },
        crewWins: { increment: !isImp && p.won ? 1 : 0 }, impWins: { increment: isImp && p.won ? 1 : 0 },
        games: { increment: 1 }, crewGames: { increment: isImp ? 0 : 1 }, impGames: { increment: isImp ? 1 : 0 },
      },
    });

    const careerCrew = isImp ? player.crewElo : applyPlacementCap(player.crewElo + eloDelta, roleGames);
    const careerImp = isImp ? applyPlacementCap(player.impElo + eloDelta, roleGames) : player.impElo;
    await tx.player.update({
      where: { id: p.playerId },
      data: {
        crewElo: careerCrew, impElo: careerImp, overallElo: (careerCrew + careerImp) / 2,
        kills: { increment: p.kills }, correctShots: { increment: p.correctShots },
        incorrectShots: { increment: p.incorrectShots }, tasksDone: { increment: p.tasksDone },
        crewWins: { increment: !isImp && p.won ? 1 : 0 }, impWins: { increment: isImp && p.won ? 1 : 0 },
        games: { increment: 1 }, crewGames: { increment: isImp ? 0 : 1 }, impGames: { increment: isImp ? 1 : 0 },
      },
    });
  }

  return results;
}
