import { NextRequest, NextResponse } from "next/server";
import { bearerOk } from "@/lib/serverAuth";
import { prisma } from "@/lib/db";

// Called by the trusted game server when a player redeems their link code in-game.
export async function POST(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const linkCode = body?.linkCode;
  if (typeof linkCode !== "string") {
    return NextResponse.json({ error: "linkCode required" }, { status: 400 });
  }
  const player = await prisma.player.findUnique({ where: { linkCode } });
  if (!player) return NextResponse.json({ error: "invalid code" }, { status: 404 });
  await prisma.player.update({ where: { id: player.id }, data: { isLinked: true } });
  return NextResponse.json({ ok: true, playerId: player.id });
}
