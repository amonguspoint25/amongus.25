import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { realPlayersWhere } from "@/lib/players";
import { partitionProvisional, type LeaderboardSort, type PlayerRow } from "@/lib/leaderboard";

export async function GET(req: NextRequest) {
  const sortParam = req.nextUrl.searchParams.get("sort") ?? "overall";
  const sort: LeaderboardSort = sortParam === "crew" ? "crew" : sortParam === "imp" ? "imp" : "overall";
  const field = sort === "crew" ? "crewElo" : sort === "imp" ? "impElo" : "overallElo";

  const players = await prisma.player.findMany({
    where: realPlayersWhere,
    orderBy: { [field]: "desc" },
    take: 100,
  });

  const rows: PlayerRow[] = players.map((p) => ({
    id: p.id,
    name: p.displayName,
    crewElo: Math.round(p.crewElo),
    impElo: Math.round(p.impElo),
    overallElo: Math.round(p.overallElo),
    games: p.games,
    crewGames: p.crewGames,
    impGames: p.impGames,
  }));

  return NextResponse.json(partitionProvisional(rows, sort));
}
