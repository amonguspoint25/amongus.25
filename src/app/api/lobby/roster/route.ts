import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerOk } from "@/lib/serverAuth";
import { prisma } from "@/lib/db";
import { normalizeFriendCode } from "@/lib/friendCode";

// Called by the trusted host mod with the current lobby roster. Maps each player's
// Among Us friend code to their registered website account, so match reports (which
// are keyed on discordId — see /api/ingest/match) can be attributed. Friend codes the
// site doesn't recognize come back as `unmatched` so the host can prompt them to link.
const rosterSchema = z.object({
  players: z
    .array(
      z.object({
        friendCode: z.string(),
        inGameId: z.number().int(),
        inGameName: z.string().optional(),
      })
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = rosterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Normalize, drop malformed codes, and remember which inGameId each maps to.
  const entries = parsed.data.players
    .map((p) => ({ inGameId: p.inGameId, friendCode: normalizeFriendCode(p.friendCode) }))
    .filter((e): e is { inGameId: number; friendCode: string } => e.friendCode !== null);

  const codes = entries.map((e) => e.friendCode);
  const players = codes.length
    ? await prisma.player.findMany({
        where: { friendCode: { in: codes } },
        include: { user: true },
      })
    : [];
  const byCode = new Map(players.map((p) => [p.friendCode!, p]));

  const matched = entries
    .map((e) => {
      const player = byCode.get(e.friendCode);
      if (!player) return null;
      return {
        inGameId: e.inGameId,
        playerId: player.id,
        discordId: player.user.discordId,
        displayName: player.displayName,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const matchedIds = new Set(matched.map((m) => m.inGameId));
  const unmatched = parsed.data.players.map((p) => p.inGameId).filter((id) => !matchedIds.has(id));

  return NextResponse.json({ matched, unmatched });
}
