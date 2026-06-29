import { prisma } from "@/lib/db";
import { partitionProvisional, type LeaderboardSort, type PlayerRow } from "@/lib/leaderboard";

// Current-season top 100, demo players excluded, split into ranked vs provisional — same shape
// the website leaderboard uses.
export async function getLeaderboard(sort: LeaderboardSort) {
  const field = sort === "crew" ? "crewElo" : sort === "imp" ? "impElo" : "overallElo";
  const season = await prisma.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
  if (!season) return { ranked: [], provisional: [] };

  const ps = await prisma.playerSeason.findMany({
    where: { seasonId: season.id, NOT: { player: { user: { discordId: { startsWith: "demo-" } } } } },
    orderBy: { [field]: "desc" },
    take: 100,
    include: { player: true },
  });
  const rows: PlayerRow[] = ps.map((r) => ({
    id: r.playerId,
    name: r.player.displayName,
    crewElo: Math.round(r.crewElo),
    impElo: Math.round(r.impElo),
    overallElo: Math.round(r.overallElo),
    games: r.games,
    crewGames: r.crewGames,
    impGames: r.impGames,
  }));
  return partitionProvisional(rows, sort);
}

// Resolve a Discord user id to their linked Player (career row), or null if not linked.
export async function getPlayerByDiscordId(discordId: string) {
  const user = await prisma.user.findUnique({ where: { discordId }, include: { player: true } });
  return user?.player ?? null;
}

// A player's most recent non-voided match participation (+ the match).
export async function getLastMatchFor(playerId: string) {
  return prisma.matchParticipant.findFirst({
    where: { playerId, match: { voided: false } },
    orderBy: { match: { startedAt: "desc" } },
    include: { match: true },
  });
}
