-- Season periods (one active: endedAt IS NULL).
CREATE TABLE "Season" (
  "id"        TEXT NOT NULL,
  "number"    INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"   TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Season_number_key" ON "Season"("number");

-- Per-season rating + stats for each player (the competitive ladder).
CREATE TABLE "PlayerSeason" (
  "id"             TEXT NOT NULL,
  "playerId"       TEXT NOT NULL,
  "seasonId"       TEXT NOT NULL,
  "crewElo"        DOUBLE PRECISION NOT NULL DEFAULT 1000,
  "impElo"         DOUBLE PRECISION NOT NULL DEFAULT 1000,
  "overallElo"     DOUBLE PRECISION NOT NULL DEFAULT 1000,
  "games"          INTEGER NOT NULL DEFAULT 0,
  "crewGames"      INTEGER NOT NULL DEFAULT 0,
  "impGames"       INTEGER NOT NULL DEFAULT 0,
  "kills"          INTEGER NOT NULL DEFAULT 0,
  "correctShots"   INTEGER NOT NULL DEFAULT 0,
  "incorrectShots" INTEGER NOT NULL DEFAULT 0,
  "tasksDone"      INTEGER NOT NULL DEFAULT 0,
  "crewWins"       INTEGER NOT NULL DEFAULT 0,
  "impWins"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerSeason_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerSeason_playerId_seasonId_key" ON "PlayerSeason"("playerId", "seasonId");

-- Tag matches with the season they counted toward.
ALTER TABLE "Match" ADD COLUMN "seasonId" TEXT;

ALTER TABLE "PlayerSeason" ADD CONSTRAINT "PlayerSeason_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerSeason" ADD CONSTRAINT "PlayerSeason_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
