import { randomInt } from "crypto";
import { prisma } from "@/lib/db";

// A link code is generated on demand, valid for this window, then expires.
export const LINK_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
// Minimum gap between (re)generations, to throttle rapid regenerate spam.
export const LINK_CODE_COOLDOWN_MS = 30 * 1000; // 30 seconds

// The link code is a capability token redeemed in-game to bind an account, so it
// must be unguessable: use a CSPRNG (crypto.randomInt), not Math.random. The
// alphabet omits I/L/O/0/1 to stay unambiguous when read off a screen.
export function genCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

// A code is expired (or absent) when there is no expiry or it is at/before now.
export function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt === null || expiresAt.getTime() <= now.getTime();
}

// Regeneration is allowed unless a code was issued less than the cooldown ago.
// Issue time is derived from the expiry minus the (constant) TTL — no stored column.
export function canRegenerate(expiresAt: Date | null, now: Date): boolean {
  if (expiresAt === null) return true;
  const issuedAt = expiresAt.getTime() - LINK_CODE_TTL_MS;
  return now.getTime() - issuedAt >= LINK_CODE_COOLDOWN_MS;
}

// Mint a fresh code for the player and stamp its expiry. linkCode is @unique; on the
// (astronomically rare) collision, regenerate and retry rather than fail the request.
export async function issueLinkCode(playerId: string, now: Date): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    try {
      await prisma.player.update({
        where: { id: playerId },
        data: { linkCode: code, linkCodeExpiresAt: new Date(now.getTime() + LINK_CODE_TTL_MS) },
      });
      return code;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002" && attempt < 4) continue; // linkCode collision
      throw err;
    }
  }
  throw new Error("could not issue a unique link code");
}

// Redeem a code: if it exists and is unexpired, link the player and clear the code
// (one-time use). Returns { ok: false } for missing, expired, or already-used codes —
// the caller maps all of these to a single response (no existence oracle).
// On success returns discordId + displayName so the calling game server can map its
// in-game player to the discordId that match ingestion (/api/ingest/match) keys on.
export async function redeemLinkCode(
  linkCode: string,
  now: Date,
): Promise<{ ok: true; playerId: string; discordId: string; displayName: string } | { ok: false }> {
  const player = await prisma.player.findUnique({ where: { linkCode }, include: { user: true } });
  if (!player || isExpired(player.linkCodeExpiresAt, now)) return { ok: false };
  await prisma.player.update({
    where: { id: player.id },
    data: { isLinked: true, linkCode: null, linkCodeExpiresAt: null },
  });
  return { ok: true, playerId: player.id, discordId: player.user.discordId, displayName: player.displayName };
}
