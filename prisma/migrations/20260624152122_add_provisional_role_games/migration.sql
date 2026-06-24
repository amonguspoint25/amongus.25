-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "crewGames" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "impGames" INTEGER NOT NULL DEFAULT 0;

-- Backfill per-role game counts from the source of truth (match participations).
UPDATE "Player" p SET "crewGames" = sub.c
FROM (
  SELECT "playerId", count(*)::int AS c
  FROM "MatchParticipant"
  WHERE "role"::text = 'CREW'
  GROUP BY "playerId"
) sub
WHERE p.id = sub."playerId";

UPDATE "Player" p SET "impGames" = sub.c
FROM (
  SELECT "playerId", count(*)::int AS c
  FROM "MatchParticipant"
  WHERE "role"::text = 'IMPOSTOR'
  GROUP BY "playerId"
) sub
WHERE p.id = sub."playerId";
