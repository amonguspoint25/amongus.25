import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { realPlayersWhere } from "@/lib/players";
import { partitionProvisional, type LeaderboardSort, type PlayerRow } from "@/lib/leaderboard";

export async function GET(req: NextRequest) {
  const sortParam = req.nextUrl.searchParams.get("sort") ?? "overall";
  const sort: LeaderboardSort = sortParam === "crew" ? "crew" : sortParam === "imp" ? "imp" : "overall";
  const field = sort === "crew" ? "crewElo" : sort === "imp" ? "impElo" : "overallElo";
  const board = req.nextUrl.searchParams.get("board") ?? "current";

  let rows: PlayerRow[] = [];

  if (board === "all-time") {
    const players = await prisma.player.findMany({ where: realPlayersWhere, orderBy: { [field]: "desc" }, take: 100 });
    rows = players.map((p) => ({
      id: p.id, name: p.displayName,
      crewElo: Math.round(p.crewElo), impElo: Math.round(p.impElo), overallElo: Math.round(p.overallElo),
      games: p.games, crewGames: p.crewGames, impGames: p.impGames,
    }));
  } else {
    // Resolve the season: "current" (active) or "season-<n>".
    const m = /^season-(\d+)$/.exec(board);
    const season = m
      ? await prisma.season.findUnique({ where: { number: Number(m[1]) } })
      : await prisma.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
    if (season) {
      const ps = await prisma.playerSeason.findMany({
        where: { seasonId: season.id, NOT: { player: { user: { discordId: { startsWith: "demo-" } } } } },
        orderBy: { [field]: "desc" },
        take: 100,
        include: { player: true },
      });
      rows = ps.map((r) => ({
        id: r.playerId, name: r.player.displayName,
        crewElo: Math.round(r.crewElo), impElo: Math.round(r.impElo), overallElo: Math.round(r.overallElo),
        games: r.games, crewGames: r.crewGames, impGames: r.impGames,
      }));
    }
  }

  return NextResponse.json(partitionProvisional(rows, sort));
}
