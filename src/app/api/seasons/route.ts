import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const seasons = await prisma.season.findMany({ orderBy: { number: "desc" } });
  return NextResponse.json({
    seasons: seasons.map((s) => ({ number: s.number, active: s.endedAt === null })),
  });
}
