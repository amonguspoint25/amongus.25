import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { realPlayersWhere } from "@/lib/players";

export async function GET(req: NextRequest) {
  const sort = req.nextUrl.searchParams.get("sort") ?? "overall";
  const field = sort === "crew" ? "crewElo" : sort === "imp" ? "impElo" : "overallElo";
  const players = await prisma.player.findMany({ where: realPlayersWhere, orderBy: { [field]: "desc" }, take: 100 });
  return NextResponse.json(
    players.map((p) => ({
      id: p.id, name: p.displayName,
      crewElo: Math.round(p.crewElo), impElo: Math.round(p.impElo),
      overallElo: Math.round(p.overallElo), games: p.games,
    }))
  );
}
