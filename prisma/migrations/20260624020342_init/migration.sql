-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('CREW_WIN', 'IMP_WIN');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CREW', 'IMPOSTOR');

-- CreateEnum
CREATE TYPE "TFormat" AS ENUM ('SINGLE_ELIM', 'DOUBLE_ELIM');

-- CreateEnum
CREATE TYPE "TStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "Bracket" AS ENUM ('WINNERS', 'LOSERS', 'GRAND');

-- CreateEnum
CREATE TYPE "Slot" AS ENUM ('TOP', 'BOTTOM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "linkCode" TEXT NOT NULL,
    "isLinked" BOOLEAN NOT NULL DEFAULT false,
    "crewElo" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "impElo" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "overallElo" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "correctShots" INTEGER NOT NULL DEFAULT 0,
    "incorrectShots" INTEGER NOT NULL DEFAULT 0,
    "tasksDone" INTEGER NOT NULL DEFAULT 0,
    "crewWins" INTEGER NOT NULL DEFAULT 0,
    "impWins" INTEGER NOT NULL DEFAULT 0,
    "games" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "map" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "won" BOOLEAN NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "correctShots" INTEGER NOT NULL DEFAULT 0,
    "incorrectShots" INTEGER NOT NULL DEFAULT 0,
    "tasksDone" INTEGER NOT NULL DEFAULT 0,
    "tasksTotal" INTEGER NOT NULL DEFAULT 0,
    "timeToTaskMs" INTEGER,
    "timeToKillMs" INTEGER,
    "survived" BOOLEAN NOT NULL DEFAULT true,
    "eloBefore" DOUBLE PRECISION NOT NULL,
    "eloAfter" DOUBLE PRECISION NOT NULL,
    "eloDelta" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bannerUrl" TEXT,
    "format" "TFormat" NOT NULL DEFAULT 'SINGLE_ELIM',
    "status" "TStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BracketMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "bracket" "Bracket" NOT NULL DEFAULT 'WINNERS',
    "round" INTEGER NOT NULL,
    "slotInRound" INTEGER NOT NULL,
    "playerAId" TEXT,
    "playerBId" TEXT,
    "winnerId" TEXT,
    "matchId" TEXT,
    "winnerNextMatchId" TEXT,
    "winnerNextSlot" "Slot",
    "loserNextMatchId" TEXT,
    "loserNextSlot" "Slot",

    CONSTRAINT "BracketMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_linkCode_key" ON "Player"("linkCode");

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionToken_hashedToken_key" ON "IngestionToken"("hashedToken");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketMatch" ADD CONSTRAINT "BracketMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
