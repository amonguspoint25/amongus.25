import { timingSafeEqual } from "crypto";

/**
 * Constant-time check that the request carries `Authorization: Bearer <INGEST_TOKEN>`.
 * Fails CLOSED when INGEST_TOKEN is unset (never accept "Bearer undefined").
 */
export function bearerOk(authHeader: string | null): boolean {
  const token = process.env.INGEST_TOKEN;
  if (!token) return false;
  if (!authHeader) return false;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(`Bearer ${token}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
