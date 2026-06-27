import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeIngest } from "@/lib/hostkey";
import { prisma } from "@/lib/db";
import { normalizeFriendCode } from "@/lib/friendCode";

// Called by the trusted host mod (per-host key) when the host runs /ranked. The mod sends
// the lobby roster; we map each friend code to the registered account and return the
// OPAQUE playerId — never the Discord id — so a leaked key can't deanonymize accounts.
// Match reports key on that same playerId (see /api/ingest/match).
//
// `matched`   -> linked players, by opaque playerId.
// `unmatched` -> in-game ids we don't recognize; the mod gates ranked until this is empty.
//
// PUID (account id) is auto-captured here: the player only ever types their friend
// code; the mod supplies the PUID and we store it the first time we see it.
const MAX_LOBBY = 30; // Among Us lobbies cap well below this; bound the request.
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
    .min(1)
    .max(MAX_LOBBY),
});

export async function POST(req: NextRequest) {
  if (!(await authorizeIngest(req.headers.get("authorization")))) {
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
    ? await prisma.player.findMany({
        where: { friendCode: { in: codes } },
        select: { id: true, displayName: true, friendCode: true, puid: true },
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
    matched: matched.map(({ inGameId, playerId, displayName }) => ({ inGameId, playerId, displayName })),
    unmatched,
  });
}
