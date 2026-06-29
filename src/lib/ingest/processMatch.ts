import { prisma } from "../db";
import type { MatchPayload } from "./schema";
import { Prisma } from "@prisma/client";
import { getOrCreateActiveSeason } from "../season/season";
import { applyMatchScoring, type ScoringPart, type MatchResult } from "./applyScoring";

export type { MatchResult };

// NOTE: Deeper anti-cheat (HMAC-signed match assertions, nonce, timing-sanity on match
// duration) is DEFERRED BY DESIGN to the game-server ingestion contract. The website
// trusts the bearer-authenticated custom server as the source of truth; per-event
// cryptographic signing belongs to that server's spec (a separate future project).

export async function processMatch(payload: MatchPayload): Promise<{ matchId: string; results: MatchResult[] }> {
  // Idempotency: short-circuit if this matchCode was already processed.
  const existing = await prisma.match.findUnique({ where: { code: payload.matchCode } });
  if (existing) return { matchId: existing.id, results: [] };

  const playerIds = payload.participants.map((p) => p.playerId);
  const players = await prisma.player.findMany({ where: { isLinked: true, id: { in: playerIds } } });
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

      const parts: ScoringPart[] = rows.map(({ p }) => ({
        playerId: p.playerId,
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
        disconnected: p.disconnected === true,
      }));

      const results = await applyMatchScoring(tx, season, match.id, parts);
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
