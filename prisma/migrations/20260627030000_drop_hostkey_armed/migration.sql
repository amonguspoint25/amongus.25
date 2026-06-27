-- The ranked "armed" flag is gone: the trigger moved in-game (/ranked) and the mod
-- knows ranked state locally, so this column is never written. Drop it.
ALTER TABLE "HostKey" DROP COLUMN "armedUntil";
