-- Account ID (PUID), auto-captured by the host mod the first time it sees a linked
-- player in a /ranked lobby. The player never types this; the friend code is the
-- human-entered key and this is the harder-to-spoof backup identity.
ALTER TABLE "Player" ADD COLUMN "puid" TEXT;
CREATE UNIQUE INDEX "Player_puid_key" ON "Player"("puid");
