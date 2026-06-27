import type { Prisma, PrismaClient, Season, PlayerSeason } from "@prisma/client";
import { softResetSeed } from "./softReset";

export type SeasonTx = Prisma.TransactionClient | PrismaClient;

// Active season = the single row with endedAt == null. Auto-creates Season 1 if none
// exists so a match is never dropped for lack of a season.
export async function getOrCreateActiveSeason(tx: SeasonTx): Promise<Season> {
  const active = await tx.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
  if (active) return active;
  try {
    return await tx.season.create({ data: { number: 1 } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const raced = await tx.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
      if (raced) return raced;
    }
    throw e;
  }
}

// Get or lazily create a player's rating row for a season, seeded by a soft reset of
// their most recent prior season (or 1000 if they have none).
export async function getOrCreatePlayerSeason(
  tx: SeasonTx,
  playerId: string,
  season: Season,
): Promise<PlayerSeason> {
  const existing = await tx.playerSeason.findUnique({
    where: { playerId_seasonId: { playerId, seasonId: season.id } },
  });
  if (existing) return existing;

  const prior = await tx.playerSeason.findFirst({
    where: { playerId, season: { number: { lt: season.number } } },
    orderBy: { season: { number: "desc" } },
  });

  try {
    return await tx.playerSeason.create({
      data: {
        playerId,
        seasonId: season.id,
        crewElo: softResetSeed(prior?.crewElo ?? null),
        impElo: softResetSeed(prior?.impElo ?? null),
        overallElo: softResetSeed(prior?.overallElo ?? null),
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const raced = await tx.playerSeason.findUnique({
        where: { playerId_seasonId: { playerId, seasonId: season.id } },
      });
      if (raced) return raced;
    }
    throw e;
  }
}

// Admin rollover: end the active season (if any) and open the next number, atomically.
// Re-checks inside the transaction so a double-click is a no-op rather than a double bump.
export async function rolloverSeason(db: PrismaClient): Promise<Season> {
  return db.$transaction(async (tx) => {
    const active = await tx.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
    const now = new Date();
    if (active) await tx.season.update({ where: { id: active.id }, data: { endedAt: now } });
    const latest = active ?? (await tx.season.findFirst({ orderBy: { number: "desc" } }));
    return tx.season.create({ data: { number: (latest?.number ?? 0) + 1, startedAt: now } });
  });
}
