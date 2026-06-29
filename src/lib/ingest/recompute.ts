import type { Prisma } from "@prisma/client";
import { applyMatchScoring, type ScoringPart } from "./applyScoring";

const BASELINE = {
  crewElo: 1000, impElo: 1000, overallElo: 1000,
  kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 0,
  crewWins: 0, impWins: 0, games: 0, crewGames: 0, impGames: 0,
};

// Rebuild ALL ratings from match history, skipping voided matches. ELO is path-dependent
// (each match is scored against the ratings at the time), so the only correct way to remove a
// match's effect is to replay everything without it. Cheap for a small league; voids are rare.
// MUST run inside a transaction (caller owns it, e.g. the void action) so a failure rolls back.
export async function recomputeAll(tx: Prisma.TransactionClient): Promise<void> {
  // Serialize recomputes (admin double-click / two admins) so two full O(matches×participants) ELO
  // replays can't run concurrently and contend on Neon. Transaction-scoped — auto-released at end.
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(727274)");

  // Reset every player to the baseline, then drop season rows — they're recreated during replay
  // with the correct soft-reset seeds (getOrCreatePlayerSeason seeds from the prior season).
  await tx.player.updateMany({ data: BASELINE });
  await tx.playerSeason.deleteMany({});

  // Global chronological order so each season's matches are fully applied before the next season's
  // PlayerSeason rows are seeded from it. createdAt breaks startedAt ties deterministically.
  const matches = await tx.match.findMany({
    where: { voided: false },
    include: { participants: true, season: true },
    orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
  });

  for (const m of matches) {
    if (!m.season) continue; // unseasoned match can't be scored into a ladder
    const parts: ScoringPart[] = m.participants.map((mp) => ({
      playerId: mp.playerId,
      role: mp.role,
      won: mp.won,
      kills: mp.kills,
      correctShots: mp.correctShots,
      incorrectShots: mp.incorrectShots,
      tasksDone: mp.tasksDone,
      tasksTotal: mp.tasksTotal,
      timeToTaskMs: mp.timeToTaskMs,
      timeToKillMs: mp.timeToKillMs,
      survived: mp.survived,
      roundsSurvived: mp.roundsSurvived,
      disconnected: mp.disconnected,
    }));
    await applyMatchScoring(tx, m.season, m.id, parts);
  }
}
