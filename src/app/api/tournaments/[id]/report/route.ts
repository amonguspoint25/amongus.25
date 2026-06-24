import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { reportBracketResult } from "@/lib/tournament/report";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await params; // tournament id is implied by the bracket match; not needed beyond auth scope
  const body = await req.json().catch(() => null);
  const { bracketMatchId, winnerId } = body ?? {};
  if (typeof bracketMatchId !== "string" || typeof winnerId !== "string") {
    return NextResponse.json({ error: "bracketMatchId and winnerId required" }, { status: 400 });
  }
  const node = await reportBracketResult(bracketMatchId, winnerId);
  return NextResponse.json({ ok: true, winnerId: node.winnerId });
}
