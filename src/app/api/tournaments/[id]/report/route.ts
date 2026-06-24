import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { reportBracketResult } from "@/lib/tournament/report";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const { bracketMatchId, winnerId } = body ?? {};
  if (typeof bracketMatchId !== "string" || typeof winnerId !== "string") {
    return NextResponse.json({ error: "bracketMatchId and winnerId required" }, { status: 400 });
  }
  // Domain integrity: the bracket match must belong to the tournament in the URL,
  // so a wrong URL can't mutate an unrelated tournament's bracket.
  const owned = await prisma.bracketMatch.findFirst({ where: { id: bracketMatchId, tournamentId: id } });
  if (!owned) return NextResponse.json({ error: "bracket match not found in this tournament" }, { status: 404 });
  // The winner must actually be a participant in this match.
  if (winnerId !== owned.playerAId && winnerId !== owned.playerBId) {
    return NextResponse.json({ error: "winnerId is not a participant of this match" }, { status: 400 });
  }
  const node = await reportBracketResult(bracketMatchId, winnerId);
  return NextResponse.json({ ok: true, winnerId: node.winnerId });
}
