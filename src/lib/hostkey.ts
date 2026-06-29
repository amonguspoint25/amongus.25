import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { bearerOk } from "@/lib/serverAuth";
import type { HostKey } from "@prisma/client";

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
  // Only write lastUsedAt when it's gone stale (>60s). Keeps a DB WRITE off the hottest path — the
  // mod heartbeat (GET /api/host/status) and every ingest — so a key polling in a loop can't drive
  // unbounded writes. When fresh, return the row as-is (callers don't need exact lastUsedAt).
  const STALE_MS = 60_000;
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > STALE_MS) {
    return prisma.hostKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  }
  return key;
}

export async function revokeHostKey(id: string): Promise<void> {
  await prisma.hostKey.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function authorizeIngest(authHeader: string | null): Promise<boolean> {
  if (bearerOk(authHeader)) return true; // keep INGEST_TOKEN for demo/seed paths
  return (await resolveHostKey(authHeader)) !== null;
}
