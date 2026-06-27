import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerOk } from "@/lib/serverAuth";
import { prisma } from "@/lib/db";
import { normalizeFriendCode } from "@/lib/friendCode";

// Called by the trusted host mod when the host runs /ranked. The mod sends the lobby
// roster; we map each player's friend code to their registered website account so
// match reports (keyed on discordId — see /api/ingest/match) can be attributed.
//
// `matched`   -> linked players, with the discordId the mod reports results under.
// `unmatched` -> in-game ids the site doesn't recognize. The mod uses this to gate:
//                only "Ranked is ready to start" when unmatched is empty (decision B).
//
// PUID (account id) is auto-captured here: the player only ever types their friend
// code; the mod supplies the PUID and we store it the first time we see it.
const rosterSchema = z.object({
  players: z
    .array(
      z.object({
        friendCode: z.string(),
        puid: z.string().optional(),
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

  // Normalize, drop malformed friend codes, remember the inGameId + supplied PUID.
  const entries = parsed.data.players
    .map((p) => ({
      inGameId: p.inGameId,
      friendCode: normalizeFriendCode(p.friendCode),
      puid: p.puid?.trim() || null,
    }))
    .filter((e): e is { inGameId: number; friendCode: string; puid: string | null } => e.friendCode !== null);

  const codes = entries.map((e) => e.friendCode);
  const players = codes.length
    ? await prisma.player.findMany({ where: { friendCode: { in: codes } }, include: { user: true } })
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
        // Capture the PUID only if we don't already have one for this account.
        puidToCapture: e.puid && !player.puid ? e.puid : null,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // Best-effort: store newly-seen account ids. A PUID already claimed by another
  // account (unique violation) is silently skipped — never block the lobby on it.
  const captures = matched.filter((m) => m.puidToCapture);
  if (captures.length) {
    await Promise.allSettled(
      captures.map((m) => prisma.player.update({ where: { id: m.playerId }, data: { puid: m.puidToCapture } }))
    );
  }

  const matchedIds = new Set(matched.map((m) => m.inGameId));
  const unmatched = parsed.data.players.map((p) => p.inGameId).filter((id) => !matchedIds.has(id));

  return NextResponse.json({
    matched: matched.map(({ inGameId, playerId, discordId, displayName }) => ({ inGameId, playerId, discordId, displayName })),
    unmatched,
  });
}
