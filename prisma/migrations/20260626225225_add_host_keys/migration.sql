-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isHost" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HostKey" (
    "id" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "armedUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HostKey_tokenHash_key" ON "HostKey"("tokenHash");

-- CreateIndex
CREATE INDEX "HostKey_hostUserId_idx" ON "HostKey"("hostUserId");

-- AddForeignKey
ALTER TABLE "HostKey" ADD CONSTRAINT "HostKey_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
