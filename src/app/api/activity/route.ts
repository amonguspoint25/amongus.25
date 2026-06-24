import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const rows = await prisma.matchParticipant.findMany({
    take: 24,
    orderBy: { match: { startedAt: "desc" } },
    include: {
      player: { select: { displayName: true } },
      match: { select: { code: true } },
    },
  });
  return NextResponse.json(
    rows.map((r) => ({
      name: r.player.displayName,
      role: r.role,
      won: r.won,
      eloDelta: Math.round(r.eloDelta),
      code: r.match.code,
    }))
  );
}
