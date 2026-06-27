import type { Prisma, PrismaClient, Season, PlayerSeason } from "@prisma/client";
import { softResetSeed } from "./softReset";

export type SeasonTx = Prisma.TransactionClient | PrismaClient;

// Active season = the single row with endedAt == null. Auto-creates Season 1 if none
// exists so a match is never dropped for lack of a season.
// ponytail: P2002 catch helps for standalone calls only. Inside processMatch's $transaction
// the failed insert aborts the whole tx so the re-read also fails; the match request errors
// and self-heals on the mod's retry.
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
// ponytail: same P2002 caveat as getOrCreateActiveSeason — catch only recovers for
// standalone calls; inside processMatch's outer tx the whole tx aborts and self-heals on retry.
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

// Admin rollover: in one transaction, end the active season (if any) and open the
// next number. Each call advances the season; the admin UI guards against accidental
// double submits.
export async function rolloverSeason(db: PrismaClient): Promise<Season> {
  return db.$transaction(async (tx) => {
    const active = await tx.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
    const now = new Date();
    if (active) await tx.season.update({ where: { id: active.id }, data: { endedAt: now } });
    const latest = active ?? (await tx.season.findFirst({ orderBy: { number: "desc" } }));
    const nextNumber = (latest?.number ?? 0) + 1;
    try {
      return await tx.season.create({ data: { number: nextNumber, startedAt: now } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        const raced = await tx.season.findFirst({ where: { number: nextNumber } });
        if (raced) return raced;
      }
      throw e;
    }
  });
}
