import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sort = req.nextUrl.searchParams.get("sort") ?? "overall";
  const field = sort === "crew" ? "crewElo" : sort === "imp" ? "impElo" : "overallElo";
  const players = await prisma.player.findMany({ orderBy: { [field]: "desc" }, take: 100 });
  return NextResponse.json(
    players.map((p) => ({
      id: p.id, name: p.displayName,
      crewElo: Math.round(p.crewElo), impElo: Math.round(p.impElo),
      overallElo: Math.round(p.overallElo), games: p.games,
    }))
  );
}
