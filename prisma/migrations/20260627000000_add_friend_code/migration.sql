-- Add the Among Us friend code used to map in-lobby players (read by the host mod)
-- to their website account. Nullable + unique: multiple NULLs allowed in Postgres.
ALTER TABLE "Player" ADD COLUMN "friendCode" TEXT;
CREATE UNIQUE INDEX "Player_friendCode_key" ON "Player"("friendCode");
