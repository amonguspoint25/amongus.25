import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  // Seasons change only on admin rollover — cache hard (5m fresh, day-long stale) so this, fetched
  // on every LeaderboardTable mount, is off the flood path. take cap is defensive.
  const seasons = await prisma.season.findMany({ orderBy: { number: "desc" }, take: 100 });
  return NextResponse.json(
    { seasons: seasons.map((s) => ({ number: s.number, active: s.endedAt === null })) },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } },
  );
}
