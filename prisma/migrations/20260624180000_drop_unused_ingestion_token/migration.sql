-- Drop the unused IngestionToken table.
-- Server auth uses the single env INGEST_TOKEN (src/lib/serverAuth.ts, timing-safe, fail-closed);
-- this table was modeled but never read or written by any code (no `prisma.ingestionToken` usage).
-- Upgrade path: re-add the model + a migration if multi-server, rotatable hashed tokens are ever needed.
DROP TABLE "IngestionToken";
