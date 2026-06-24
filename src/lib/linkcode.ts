import { randomInt } from "crypto";

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
