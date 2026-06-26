import { createHash, randomBytes } from "crypto";

export const HOST_ARM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const KEY_PREFIX = "amrk_";
const PREFIX_DISPLAY_LEN = 12;

/** A new host key: the raw secret (shown once), its sha256 hash (stored), and a short display prefix. */
export function genHostKey(): { raw: string; tokenHash: string; tokenPrefix: string } {
  const raw = KEY_PREFIX + randomBytes(24).toString("base64url"); // ~32 url-safe chars
  return { raw, tokenHash: hashToken(raw), tokenPrefix: raw.slice(0, PREFIX_DISPLAY_LEN) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Extract the token from an `Authorization: Bearer <token>` header, or null. */
export function parseBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer (.+)$/);
  return m && m[1].length > 0 ? m[1] : null;
}

export function isArmed(armedUntil: Date | null, now: Date): boolean {
  return armedUntil !== null && armedUntil.getTime() > now.getTime();
}
