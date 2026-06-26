import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { bearerOk } from "@/lib/serverAuth";
import type { HostKey } from "@prisma/client";

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

export async function createHostKey(
  hostUserId: string,
  label: string,
): Promise<{ id: string; raw: string; tokenPrefix: string }> {
  const { raw, tokenHash, tokenPrefix } = genHostKey();
  const row = await prisma.hostKey.create({ data: { hostUserId, label, tokenHash, tokenPrefix } });
  return { id: row.id, raw, tokenPrefix };
}

export async function resolveHostKey(authHeader: string | null): Promise<HostKey | null> {
  const raw = parseBearer(authHeader);
  if (!raw) return null;
  const key = await prisma.hostKey.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!key || key.revokedAt) return null;
  // Return the UPDATED row so callers see the fresh lastUsedAt.
  return prisma.hostKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
}

export async function revokeHostKey(id: string): Promise<void> {
  await prisma.hostKey.update({ where: { id }, data: { revokedAt: new Date(), armedUntil: null } });
}

export async function armHost(hostUserId: string, now: Date): Promise<Date> {
  const armedUntil = new Date(now.getTime() + HOST_ARM_TTL_MS);
  await prisma.hostKey.updateMany({ where: { hostUserId, revokedAt: null }, data: { armedUntil } });
  return armedUntil;
}

export async function disarmHost(hostUserId: string): Promise<void> {
  await prisma.hostKey.updateMany({ where: { hostUserId, revokedAt: null }, data: { armedUntil: null } });
}

export async function hostStatus(
  authHeader: string | null,
  now: Date,
): Promise<{ armed: boolean; armedUntil: Date | null } | null> {
  const key = await resolveHostKey(authHeader);
  if (!key) return null;
  return { armed: isArmed(key.armedUntil, now), armedUntil: key.armedUntil };
}

export async function authorizeIngest(authHeader: string | null): Promise<boolean> {
  if (bearerOk(authHeader)) return true; // keep INGEST_TOKEN for demo/seed paths
  return (await resolveHostKey(authHeader)) !== null;
}
