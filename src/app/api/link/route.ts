import { NextRequest, NextResponse } from "next/server";
import { bearerOk } from "@/lib/serverAuth";
import { redeemLinkCode } from "@/lib/linkcode";

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
  const result = await redeemLinkCode(linkCode, new Date());
  if (!result.ok) {
    // Single response for missing / expired / already-used — no existence oracle.
    return NextResponse.json({ error: "invalid or expired code" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, playerId: result.playerId });
}
